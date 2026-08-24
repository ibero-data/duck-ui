/**
 * Collaborative editing binding for Monaco.
 *
 * Written here rather than pulled in as a dependency (§10 allows either). The
 * binding is small, and the parts that matter are exactly the parts a generic
 * package tends to get subtly wrong for a given editor setup: which edits are
 * echoed back, how the cursor is preserved, and what happens when a remote
 * change lands while someone is mid-selection.
 *
 * The contract in one line: a change from the network must never be re-sent as
 * a local change, and a local change must never be applied twice.
 */

import type * as monaco from "monaco-editor";
import * as Y from "yjs";
import type { PresenceChannel, RemotePresence } from "@/services/collaboration/presence";

export interface BindingOptions {
  text: Y.Text;
  model: monaco.editor.ITextModel;
  editor: monaco.editor.IStandaloneCodeEditor;
  presence?: PresenceChannel;
  tabId: string;
}

export interface CollaborativeBinding {
  destroy(): void;
}

/**
 * Binds a Y.Text to a Monaco model, both directions.
 *
 * Returns a handle whose `destroy` detaches everything — closing a tab or
 * ending a session must leave no listener holding a destroyed model.
 */
export const bindCollaborativeEditor = (options: BindingOptions): CollaborativeBinding => {
  const { text, model, editor, presence, tabId } = options;

  let applyingRemote = false;
  let disposed = false;
  const decorations = editor.createDecorationsCollection();

  // Reconcile the model with shared state, WITHOUT destroying anything.
  //
  // Two directions, and picking the wrong one loses work:
  //  - shared text has content  → the document wins; a guest's empty editor
  //    must not blank out what the host has written.
  //  - shared text is empty     → the model wins; blindly calling setValue("")
  //    here erases whatever the user had already typed in this tab, which is
  //    exactly what "Please enter a query to execute" looks like from the
  //    outside.
  const shared = text.toString();
  const local = model.getValue();

  if (shared && shared !== local) {
    applyingRemote = true;
    try {
      model.setValue(shared);
    } finally {
      applyingRemote = false;
    }
  } else if (!shared && local) {
    text.doc?.transact(() => text.insert(0, local), "local");
  }

  /** Shared text changed — apply to the model as a minimal set of edits. */
  const onTextChange = (event: Y.YTextEvent, transaction: Y.Transaction) => {
    if (disposed) return;
    // Our own edits already exist in the model.
    if (transaction.local) return;

    applyingRemote = true;
    try {
      const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
      let index = 0;

      for (const delta of event.delta) {
        if (delta.retain !== undefined) {
          index += delta.retain;
        } else if (delta.insert !== undefined) {
          const inserted = typeof delta.insert === "string" ? delta.insert : "";
          const position = model.getPositionAt(index);
          edits.push({
            range: {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            },
            text: inserted,
          });
          index += inserted.length;
        } else if (delta.delete !== undefined) {
          const start = model.getPositionAt(index);
          const end = model.getPositionAt(index + delta.delete);
          edits.push({
            range: {
              startLineNumber: start.lineNumber,
              startColumn: start.column,
              endLineNumber: end.lineNumber,
              endColumn: end.column,
            },
            text: "",
          });
        }
      }

      if (edits.length > 0) {
        // `pushEditOperations` rather than `setValue`: it preserves the local
        // caret and the undo stack, so someone else typing does not yank the
        // cursor out from under you.
        model.pushEditOperations([], edits, () => null);
      }
    } finally {
      applyingRemote = false;
    }
  };

  text.observe(onTextChange);

  /** Model changed locally — mirror into shared text. */
  const modelListener = model.onDidChangeContent((event) => {
    if (disposed || applyingRemote) return;
    if (event.isFlush) return;

    text.doc?.transact(() => {
      // Monaco reports changes against the pre-change document, so applying
      // them in reverse offset order keeps every offset valid.
      const ordered = [...event.changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
      for (const change of ordered) {
        if (change.rangeLength > 0) text.delete(change.rangeOffset, change.rangeLength);
        if (change.text) text.insert(change.rangeOffset, change.text);
      }
    }, "local");
  });

  /** Publish this caret so others can see where we are. */
  const cursorListener = presence
    ? editor.onDidChangeCursorSelection(() => {
        if (disposed) return;
        const selection = editor.getSelection();
        if (!selection) return;
        presence.publish({
          ...presence.identity,
          cursor: {
            tabId,
            anchor: model.getOffsetAt(selection.getStartPosition()),
            head: model.getOffsetAt(selection.getEndPosition()),
          },
        });
      })
    : null;

  /**
   * Draw other people's carets and selections.
   *
   * Two decorations per peer, and both matter:
   *  - the SELECTION, when anchor != head. An empty range renders as nothing
   *    in Monaco, which is why an earlier version showed selections but no
   *    cursor for a peer who was just typing.
   *  - the CARET, always: a zero-width decoration at the head styled into a
   *    vertical bar with the peer's name flag above it, the way every
   *    multiplayer editor renders "someone is here".
   */
  const renderPeers = (peers: RemotePresence[]) => {
    if (disposed) return;
    const next: monaco.editor.IModelDeltaDecoration[] = [];

    for (const peer of peers) {
      if (!peer.cursor || peer.cursor.tabId !== tabId) continue;
      const length = model.getValueLength();
      const from = Math.min(peer.cursor.anchor, peer.cursor.head, length);
      const to = Math.min(Math.max(peer.cursor.anchor, peer.cursor.head), length);
      const start = model.getPositionAt(from);
      const end = model.getPositionAt(to);
      const head = model.getPositionAt(Math.min(peer.cursor.head, length));

      if (from !== to) {
        next.push({
          range: {
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
          },
          options: {
            className: `duck-peer-selection duck-peer-selection-${peer.clientId}`,
            hoverMessage: { value: peer.displayName },
            stickiness: 1,
          },
        });
      }

      next.push({
        range: {
          startLineNumber: head.lineNumber,
          startColumn: head.column,
          endLineNumber: head.lineNumber,
          endColumn: head.column,
        },
        options: {
          className: `duck-peer-caret duck-peer-caret-${peer.clientId}`,
          hoverMessage: { value: peer.displayName },
          stickiness: 1,
          showIfCollapsed: true,
        },
      });
      injectPeerStyle(peer);
    }

    decorations.set(next);
  };

  const presenceListener = presence?.onChange(renderPeers) ?? null;
  if (presence) {
    renderPeers(presence.peers());
    // Announce where we are right away: without this, a peer who opens a tab
    // and reads without moving the caret is invisible to everyone else.
    const selection = editor.getSelection();
    if (selection) {
      presence.publish({
        ...presence.identity,
        cursor: {
          tabId,
          anchor: model.getOffsetAt(selection.getStartPosition()),
          head: model.getOffsetAt(selection.getEndPosition()),
        },
      });
    }
  }

  return {
    destroy() {
      if (disposed) return;
      disposed = true;
      text.unobserve(onTextChange);
      modelListener.dispose();
      cursorListener?.dispose();
      presenceListener?.();
      decorations.clear();
      removeInjectedStyles();
    },
  };
};

//
// Per-peer colours
//
// Injected as a stylesheet because Monaco decorations take class names, not
// inline styles. Scoped to one element so teardown is a single removal.
//

const STYLE_ID = "duck-peer-cursor-styles";
const injected = new Map<number, string>();

const styleElement = (): HTMLStyleElement | null => {
  if (typeof document === "undefined") return null;
  let element = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!element) {
    element = document.createElement("style");
    element.id = STYLE_ID;
    document.head.appendChild(element);
  }
  return element;
};

/** A display name, made safe to embed in a CSS `content` string. */
const cssName = (value: string): string =>
  `"${value.slice(0, 40).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const injectPeerStyle = (peer: RemotePresence): void => {
  const key = `${peer.color}|${peer.displayName}`;
  if (injected.get(peer.clientId) === key) return;
  const element = styleElement();
  if (!element) return;

  injected.set(peer.clientId, key);
  element.textContent = [...injected.entries()]
    .map(([clientId, entry]) => {
      const [color, ...nameParts] = entry.split("|");
      const label = cssName(nameParts.join("|"));
      return [
        `.duck-peer-selection-${clientId}{background-color:${color}33;}`,
        // The caret: a zero-width span turned into a 2px bar. `position:
        // relative` keeps the name flag anchored to it while it moves.
        `.duck-peer-caret-${clientId}{position:relative;border-left:2px solid ${color};margin-left:-1px;}`,
        // The name flag above the caret, always visible — a colored bar with
        // no name is a puzzle, not presence.
        `.duck-peer-caret-${clientId}::after{content:${label};position:absolute;left:-2px;top:-1.15em;` +
          `background:${color};color:#fff;font-size:10px;line-height:1.3;padding:0 4px;border-radius:3px 3px 3px 0;` +
          `white-space:nowrap;pointer-events:none;z-index:10;}`,
      ].join("");
    })
    .join("\n");
};

const removeInjectedStyles = (): void => {
  injected.clear();
  if (typeof document === "undefined") return;
  document.getElementById(STYLE_ID)?.remove();
};
