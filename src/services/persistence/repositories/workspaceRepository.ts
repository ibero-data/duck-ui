import { isUsingOpfs, getSystemConnection } from "../systemDb";
import { fallbackPut, fallbackGet } from "../fallback";

export interface WorkspaceState {
  profile_id: string;
  tabs: string; // JSON array
  active_tab_id: string | null;
  current_connection_id: string | null;
  current_database: string | null;
  updated_at: string;
}

export async function saveWorkspace(
  profileId: string,
  data: {
    tabs: string;
    activeTabId: string | null;
    currentConnectionId: string | null;
    currentDatabase: string | null;
  }
): Promise<void> {
  const now = new Date().toISOString();

  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    const escapedTabs = data.tabs.replace(/'/g, "''");
    await conn.query(`
      INSERT OR REPLACE INTO workspace_state (profile_id, tabs, active_tab_id, current_connection_id, current_database, updated_at)
      VALUES ('${profileId}', '${escapedTabs}', ${data.activeTabId ? `'${data.activeTabId}'` : "NULL"}, ${data.currentConnectionId ? `'${data.currentConnectionId}'` : "NULL"}, ${data.currentDatabase ? `'${data.currentDatabase}'` : "NULL"}, '${now}')
    `);
  } else {
    await fallbackPut("workspace_state", {
      profile_id: profileId,
      tabs: data.tabs,
      active_tab_id: data.activeTabId,
      current_connection_id: data.currentConnectionId,
      current_database: data.currentDatabase,
      updated_at: now,
    });
  }
}

export async function loadWorkspace(profileId: string): Promise<WorkspaceState | null> {
  if (isUsingOpfs()) {
    const conn = getSystemConnection();
    const result = await conn.query(
      `SELECT * FROM workspace_state WHERE profile_id = '${profileId}'`
    );
    const rows = result.toArray();
    if (rows.length === 0) return null;
    const r = rows[0].toJSON();
    return {
      profile_id: String(r.profile_id),
      tabs: String(r.tabs),
      active_tab_id: r.active_tab_id ? String(r.active_tab_id) : null,
      current_connection_id: r.current_connection_id ? String(r.current_connection_id) : null,
      current_database: r.current_database ? String(r.current_database) : null,
      updated_at: String(r.updated_at),
    };
  } else {
    return (await fallbackGet("workspace_state", profileId)) as WorkspaceState | null;
  }
}
