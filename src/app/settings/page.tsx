"use client";

import { useState } from "react";
import { clearLocalData } from "@/persistence/data-control";
import { usePractice } from "@/ui/provider";
import { Shell } from "@/ui/shell";
import { download } from "@/ui/model";
import type { PracticeData } from "@/domain/types";

export default function Settings() {
  const { runtime, state, preferences, credentials } = usePractice();
  const [key, setKey] = useState(credentials.key ?? "");
  const [showKey, setShowKey] = useState(false);
  const [remember, setRemember] = useState(credentials.remembered);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<{ json: string; data: PracticeData } | null>(null);
  const [busy, setBusy] = useState(false);
  const act = (action: () => void) => {
    try { action(); }
    catch { setMessage("This setting changed in memory but could not be saved. Browser storage is unavailable."); }
  };
  return <Shell>
    <section className="page-heading">
      <p className="eyebrow">Settings</p>
      <h1 data-route-heading tabIndex={-1}>Your practice workspace</h1>
      <p>Choose AI access and manage the work saved in this browser.</p>
    </section>
    <section className="settings-section">
      <h2>AI review access</h2>
      <p>MCQ scoring works without a provider key. Full practice uses Groq for design review.</p>
      <div className="review-configuration" aria-live="polite">
        <h3>Configured design review</h3>
        <dl>
          <div><dt>Provider</dt><dd>{runtime.config ? "Groq" : "Loading…"}</dd></div>
          <div><dt>Model</dt><dd>{runtime.config?.model ?? "Loading…"}</dd></div>
        </dl>
        <p className="meta">Provider and model are configured by this application; they are shown here for transparency, not selection. Read <a href="https://console.groq.com/docs/your-data" target="_blank" rel="noreferrer">Groq data controls</a> for provider handling details.</p>
      </div>
      <fieldset>
        <legend>Credential mode</legend>
        <label className="choice"><input type="radio" name="credential-mode" checked={preferences.credentialMode === "platform"} onChange={() => act(() => preferences.setCredentialMode("platform"))}/><span>Use platform API<small>{runtime.config?.platformAvailable ? "Platform review is configured." : "Platform review is currently unavailable."}</small></span></label>
        <label className="choice"><input type="radio" name="credential-mode" checked={preferences.credentialMode === "user"} onChange={() => act(() => preferences.setCredentialMode("user"))}/><span>Use my own API key<small>Your selected credential mode is never changed automatically.</small></span></label>
      </fieldset>
      {preferences.credentialMode === "user" && <div className="field-stack">
        <div className="key-entry">
          <label>Groq API key<input type={showKey ? "text" : "password"} autoComplete="off" spellCheck={false} maxLength={512} placeholder="gsk_…" value={key} onChange={event => setKey(event.target.value)}/></label>
          <button type="button" aria-pressed={showKey} onClick={() => setShowKey(visible => !visible)}>{showKey ? "Hide key" : "Show key"}</button>
        </div>
        <label className="choice"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)}/>Remember this key on this browser</label>
        <p className="meta">Keys stay in memory unless you opt in. Remembered keys use browser storage, which is not an encrypted secret vault. Keys are excluded from backups and sent only for a review you request.</p>
        <div className="actions">
          <button className="primary" disabled={!key.trim()} onClick={() => act(() => { credentials.setKey(key.trim(), remember); setMessage(remember ? "Key saved on this browser." : "Key set for this browser session."); })}>Save key preference</button>
          <button onClick={() => act(() => { credentials.clearKey(); setKey(""); setShowKey(false); setRemember(false); setMessage("Learner key removed."); })}>Forget key</button>
        </div>
      </div>}
      {runtime.configError && <p role="alert">{runtime.configError}</p>}
      <button onClick={async () => { await runtime.refreshConfig(); setMessage(runtime.configError ?? "Review availability refreshed."); }}>Reload review availability</button>
    </section>
    <section className="settings-section">
      <h2>Practice data</h2>
      <p>{state.data.attempts.length} attempts in this browser. Backups contain designs, frozen submissions, feedback, and revision links.</p>
      <button onClick={() => act(() => { download("lldpractice-backup.json", runtime.repository.exportPractice()); setMessage("Practice backup exported. Credentials are excluded."); })}>Export practice data</button>
      <label className="file-input">Import backup<input type="file" accept=".json,application/json" disabled={busy || state.access === "readonly"} onChange={async event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { setMessage("Backup exceeds the 10 MiB limit."); return; }
        try { const json = await file.text(); setPending({ json, data: runtime.repository.previewImport(json) }); setMessage(""); }
        catch { setPending(null); setMessage("This file is not a valid supported practice backup. Existing data was preserved."); }
      }}/></label>
      {pending && <div className="notice">
        <h3>Restore {pending.data.attempts.length} attempts</h3>
        <p>This replaces current practice data and cancels active evaluations. Export a backup first if you need the current work.</p>
        {state.access === "corrupt" && <p>The unreadable data will be replaced only after the validated backup is saved. Download recovery data first if needed.</p>}
        <div className="actions">
          <button disabled={busy || (state.access !== "writable" && !(state.access === "corrupt" && runtime.repository.canClear()))} onClick={async () => {
            setBusy(true);
            runtime.coordinator.invalidate();
            try {
              const result = await runtime.repository.importConfirmed(pending.json);
              setMessage(result.ok ? "Backup restored." : `Backup was not restored: ${result.message}`);
              if (result.ok) setPending(null);
            } finally { setBusy(false); }
          }}>Replace practice with backup</button>
          <button onClick={() => setPending(null)}>Cancel import</button>
        </div>
      </div>}
      <div className="danger-zone">
        <h3>Clear local data</h3>
        <p>Remove this app’s attempts, preferences, and remembered credential. Active reviews will be cancelled.</p>
        <button disabled={busy || !runtime.repository.canClear()} onClick={() => {
          if (!window.confirm("Clear all LLD Practice data on this browser? This removes attempts, preferences, and remembered keys. Export a backup first if needed.")) return;
          const outcomes = clearLocalData({ storage: runtime.storage, repository: runtime.repository, credentialsStore: runtime.credentials, preferencesStore: runtime.preferences, abortActive: () => runtime.coordinator.invalidate() });
          setKey("");
          setShowKey(false);
          setRemember(false);
          setPending(null);
          setMessage(outcomes.every(outcome => outcome.ok) ? "All local practice data cleared." : `Clearing was incomplete. Writes are suspended. Failed: ${outcomes.filter(outcome => !outcome.ok).map(outcome => `${outcome.key}: ${outcome.message}`).join("; ")}`);
        }}>Clear all local data</button>
      </div>
    </section>
    {message && <div className="notice" role="status">{message}</div>}
  </Shell>;
}
