/**
 * Real WebRTC connections.
 *
 * Deliberately thin. Everything that could be wrong in an interesting way —
 * framing, chunking, reassembly, backpressure, validation, cancellation — lives
 * in `ChannelTransport`, which is driven by an in-process loopback in tests.
 * This file's only job is to produce five open `RTCDataChannel`s and hand them
 * over, so the code path that carries a real query is the same one the tests
 * exercise.
 *
 * ## Non-trickle ICE
 *
 * Candidates are gathered fully BEFORE the offer or answer is handed back,
 * rather than trickled as they appear. Trickle connects faster, but it needs a
 * live bidirectional signaling channel for the whole handshake. Waiting for
 * gathering to finish makes the offer and the answer each a single
 * self-contained blob — which is what lets two people pair by pasting two
 * links to each other, with no server involved at any point.
 *
 * The cost is a slower connect (bounded by `ICE_GATHER_TIMEOUT_MS`). For a
 * handshake a human is driving, that is the right trade.
 */

import { ChannelTransport, type DataChannelLike } from "./channelTransport";
import { CHANNEL_CONFIG, CHANNEL_NAMES, type ChannelName } from "./transport";
import { resolveIceServers } from "../signaling/client";

/**
 * Stop waiting for more ICE candidates after this. Gathering often completes
 * in well under a second; a network where it never completes at all must not
 * hang the pairing screen forever.
 */
export const ICE_GATHER_TIMEOUT_MS = 8_000;

/** Give up if the peer connection never actually connects. */
export const CONNECT_TIMEOUT_MS = 30_000;

/**
 * How long a guest waits for the host to paste its code. Long, because a human
 * is in the loop: they have to switch apps, send a message, and be read.
 */
export const PAIRING_TIMEOUT_MS = 10 * 60_000;

export interface WebRtcSetup {
  connection: RTCPeerConnection;
  transport: ChannelTransport;
  /** The five data channels, so the caller can await them opening. */
  channels: RTCDataChannel[];
  /** Complete local description, with every gathered candidate inside it. */
  localDescription: string;
}

const channelsFrom = (
  channels: Map<ChannelName, RTCDataChannel>
): Partial<Record<ChannelName, DataChannelLike>> => {
  const result: Partial<Record<ChannelName, DataChannelLike>> = {};
  for (const [name, channel] of channels) {
    result[name] = channel as unknown as DataChannelLike;
  }
  return result;
};

/** Resolves once ICE gathering finishes, or the timeout expires. */
const awaitIceGathering = (connection: RTCPeerConnection): Promise<void> =>
  new Promise((resolve) => {
    if (connection.iceGatheringState === "complete") {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      connection.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    };

    const onChange = () => {
      if (connection.iceGatheringState === "complete") finish();
    };

    // Not an error: whatever candidates we have are usually enough, and a
    // host-only candidate set still works on a LAN.
    const timer = setTimeout(finish, ICE_GATHER_TIMEOUT_MS);
    connection.addEventListener("icegatheringstatechange", onChange);
  });

/** Resolves once a data channel is open. */
const awaitChannelOpen = (channel: RTCDataChannel): Promise<void> =>
  new Promise((resolve, reject) => {
    if (channel.readyState === "open") {
      resolve();
      return;
    }
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Channel "${channel.label}" failed to open`));
    };
    const cleanup = () => {
      channel.removeEventListener("open", onOpen);
      channel.removeEventListener("error", onError);
    };
    channel.addEventListener("open", onOpen);
    channel.addEventListener("error", onError);
  });

/**
 * How long a "disconnected" RTC state may last before the session gives up on
 * it. WebRTC reports "disconnected" on any transient ICE hiccup — a wifi
 * blip, a route change — and recovers to "connected" by itself most of the
 * time. Tearing everything down instantly turns every blip into "re-pair from
 * scratch", which for manual signaling means new codes for everyone.
 */
export const DISCONNECT_GRACE_MS = 12_000;

/** Wires connection-state changes through to the transport. */
const bindConnectionState = (connection: RTCPeerConnection, transport: ChannelTransport): void => {
  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelGrace = () => {
    if (graceTimer) clearTimeout(graceTimer);
    graceTimer = null;
  };

  connection.addEventListener("connectionstatechange", () => {
    switch (connection.connectionState) {
      case "connected":
        cancelGrace();
        transport.setState("connected");
        break;
      case "disconnected":
        // Give ICE its chance to recover before anyone drops grants, cursors
        // or guests. Only if the state is STILL disconnected after the grace
        // window does the rest of the app hear about it.
        if (graceTimer) break;
        graceTimer = setTimeout(() => {
          graceTimer = null;
          if (connection.connectionState === "disconnected") {
            transport.setState("disconnected");
          }
        }, DISCONNECT_GRACE_MS);
        break;
      case "failed":
        cancelGrace();
        transport.setState("failed");
        break;
      case "closed":
        cancelGrace();
        transport.setState("closed");
        break;
      default:
        break;
    }
  });
};

/**
 * Host side: creates the channels, produces an offer with candidates included.
 *
 * The returned transport is not usable until the answer comes back and
 * `acceptAnswer` is called.
 */
export const createHostConnection = async (peerId: string): Promise<WebRtcSetup> => {
  const connection = new RTCPeerConnection({ iceServers: resolveIceServers() });
  const channels = new Map<ChannelName, RTCDataChannel>();

  // The HOST creates every channel, so both sides agree on labels and order
  // without negotiating it.
  for (const name of CHANNEL_NAMES) {
    const config = CHANNEL_CONFIG[name];
    channels.set(
      name,
      connection.createDataChannel(name, {
        ordered: config.ordered,
        ...(config.maxRetransmits !== undefined ? { maxRetransmits: config.maxRetransmits } : {}),
      })
    );
  }

  const offer = await connection.createOffer();
  await connection.setLocalDescription(offer);
  await awaitIceGathering(connection);

  const transport = new ChannelTransport({ peerId, channels: channelsFrom(channels) });
  bindConnectionState(connection, transport);

  return {
    connection,
    transport,
    channels: [...channels.values()],
    localDescription: JSON.stringify(connection.localDescription),
  };
};

/** Host side: completes the handshake with the guest's answer. */
export const acceptAnswer = async (
  connection: RTCPeerConnection,
  answerSdp: string
): Promise<void> => {
  let description: RTCSessionDescriptionInit;
  try {
    description = JSON.parse(answerSdp) as RTCSessionDescriptionInit;
  } catch {
    throw new Error("That doesn't look like a valid connection code");
  }
  if (description?.type !== "answer" || typeof description.sdp !== "string") {
    throw new Error("That code is not an answer — check you pasted the right one");
  }
  await connection.setRemoteDescription(description);
};

/** What the guest gets back: an answer to send NOW, and channels later. */
export interface GuestHandshake {
  connection: RTCPeerConnection;
  /** Answer with candidates included. Ready to send the moment this resolves. */
  localDescription: string;
  /**
   * Resolves once the host has applied the answer and the channels are open.
   *
   * Deliberately NOT awaited before returning the answer. The channels cannot
   * open until the host applies the answer, and the host cannot apply an answer
   * that has not been produced — waiting here deadlocks the pairing, with the
   * guest showing no code and the host waiting for one forever.
   */
  ready: Promise<{ transport: ChannelTransport; channels: RTCDataChannel[] }>;
}

/**
 * Guest side: takes the host's offer and produces an answer immediately.
 *
 * The answer is available as soon as ICE gathering finishes. Everything that
 * depends on the host acting on it is deferred to `ready`.
 */
export const createGuestConnection = async (
  peerId: string,
  offerSdp: string
): Promise<GuestHandshake> => {
  let offer: RTCSessionDescriptionInit;
  try {
    offer = JSON.parse(offerSdp) as RTCSessionDescriptionInit;
  } catch {
    throw new Error("That invite link is not readable");
  }
  if (offer?.type !== "offer" || typeof offer.sdp !== "string") {
    throw new Error("That invite link does not contain a connection offer");
  }

  const connection = new RTCPeerConnection({ iceServers: resolveIceServers() });
  const channels = new Map<ChannelName, RTCDataChannel>();

  // Channels are created by the host, so they arrive as events. Collect them
  // before answering so none is missed.
  const expected = new Set<ChannelName>(CHANNEL_NAMES);
  const allChannels = new Promise<void>((resolve, reject) => {
    // Generous, because the clock effectively starts when the guest produces
    // its code and stops when a person has pasted it into the other browser.
    const timer = setTimeout(
      () => reject(new Error("The host did not finish connecting in time")),
      PAIRING_TIMEOUT_MS
    );
    connection.addEventListener("datachannel", (event) => {
      const label = event.channel.label as ChannelName;
      if (!expected.has(label)) return;
      channels.set(label, event.channel);
      expected.delete(label);
      if (expected.size === 0) {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  await connection.setRemoteDescription(offer);
  const answer = await connection.createAnswer();
  await connection.setLocalDescription(answer);
  await awaitIceGathering(connection);

  // The answer is complete here. Hand it back straight away; the rest of the
  // handshake needs the host to act on it first.
  const ready = (async () => {
    await allChannels;
    await Promise.all([...channels.values()].map(awaitChannelOpen));

    const transport = new ChannelTransport({ peerId, channels: channelsFrom(channels) });
    bindConnectionState(connection, transport);
    if (connection.connectionState === "connected") {
      transport.setState("connected");
    }
    return { transport, channels: [...channels.values()] };
  })();

  return {
    connection,
    ready,
    localDescription: JSON.stringify(connection.localDescription),
  };
};

/** Host side: waits for its own channels to open once the answer is in. */
export const awaitHostChannels = async (
  connection: RTCPeerConnection,
  transport: ChannelTransport,
  channels: RTCDataChannel[]
): Promise<void> => {
  await Promise.race([
    Promise.all(channels.map(awaitChannelOpen)),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("The other person's browser did not finish connecting")),
        CONNECT_TIMEOUT_MS
      )
    ),
  ]);
  if (connection.connectionState === "connected") {
    transport.setState("connected");
  }
};
