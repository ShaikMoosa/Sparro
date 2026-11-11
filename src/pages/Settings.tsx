import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Input, Label, Text, TextField } from "react-aria-components";
import { useBlocker } from "react-router";

import { api, useSave, useSettings } from "../api";
import { errorMessage } from "../api/client";
import type { Bucket } from "../bindings/Bucket";
import { Button, ConfirmDelete, FormDialog, PageHeader, SelectField, Toggle, useToast } from "../components/ui";
import { BUCKETS, BUCKET_BAR, BUCKET_LABEL } from "../lib/colors";
import { BACKUP_FILTER, chooseOpenPath, chooseSavePath, fileName } from "../lib/files";
import { todayISO } from "../lib/format";

const DEFAULTS: Record<Bucket, number> = { needs: 50, wants: 30, savings: 20 };
const DESCRIPTIONS: Record<Bucket, string> = {
  needs: "Essentials and regular commitments",
  wants: "Lifestyle, leisure and the little extras",
  savings: "Build your future, one goal at a time",
};
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ id: d, label: d === 1 ? "1 day before" : `${d} days before` }));

const groupINR = (digits: string) => (digits ? new Intl.NumberFormat("en-IN").format(Number(digits)) : "");

export function SettingsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const [pcts, setPcts] = useState<Record<Bucket, string>>({ needs: "50", wants: "30", savings: "20" });
  const [goal, setGoal] = useState("");
  const [reminders, setReminders] = useState(true);
  const [days, setDays] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    if (!settings) return;
    setPcts({ needs: String(settings.needsPct), wants: String(settings.wantsPct), savings: String(settings.savingsPct) });
    setGoal(String(Math.round(settings.goalAmount / 100)));
    setReminders(settings.remindersEnabled);
    setDays(settings.reminderDays);
    setError(null);
  }
  useEffect(reset, [settings]);

  const values = Object.fromEntries(BUCKETS.map((b) => [b, Number(pcts[b] || 0)])) as Record<Bucket, number>;
  const total = values.needs + values.wants + values.savings;
  const outOfRange = BUCKETS.some((b) => !/^\d{1,3}$/.test(pcts[b]) || values[b] > 100);
  const goalRupees = Number(goal || 0);
  const valid = total === 100 && !outOfRange && goalRupees > 0;
  const dirty =
    !!settings &&
    (values.needs !== settings.needsPct ||
      values.wants !== settings.wantsPct ||
      values.savings !== settings.savingsPct ||
      goalRupees * 100 !== settings.goalAmount ||
      reminders !== settings.remindersEnabled ||
      days !== settings.reminderDays);

  // SET-05: ask before leaving with unsaved changes.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  const save = useSave(() =>
    api.settings.save({
      needsPct: values.needs,
      wantsPct: values.wants,
      savingsPct: values.savings,
      goalAmount: goalRupees * 100,
      remindersEnabled: reminders,
      reminderDays: days,
    }),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    try {
      await save.mutateAsync(undefined);
      setError(null);
      toast("Settings saved.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function backup() {
    const path = await chooseSavePath(`Sparro-backup-${todayISO()}.sparro`, [BACKUP_FILTER]);
    if (!path) return;
    setBusy(true);
    try {
      await api.data.backup(path);
      toast(`Backup saved to ${fileName(path)}.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function pickRestore() {
    const path = await chooseOpenPath([BACKUP_FILTER]);
    if (path) setRestorePath(path);
    else if (!("__TAURI_INTERNALS__" in window)) toast("Restoring a backup works in the desktop app.", "error");
  }

  return (
    <form className="page" onSubmit={submit} noValidate>
      <PageHeader title="Settings" description="Set your budget split and the financial goals you’re working toward." />
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      <section className="card card--panel settings-card" aria-labelledby="rules-heading">
        <div className="settings-card__head">
          <div>
            <h2 id="rules-heading" className="card__title">
              Budget rules
            </h2>
            <p className="card__subtitle">Choose how to divide your income. Your percentages must add up to 100%.</p>
          </div>
          <Button size="l" onPress={() => setPcts({ needs: "50", wants: "30", savings: "20" })}>
            Reset all to default
          </Button>
        </div>
        <div className="rule-grid">
          {BUCKETS.map((b) => (
            <TextField
              key={b}
              className="rule"
              value={pcts[b]}
              onChange={(v) => setPcts((p) => ({ ...p, [b]: v.replace(/\D/g, "").slice(0, 3) }))}
              isInvalid={total !== 100 || values[b] > 100}
              validationBehavior="aria"
            >
              <Label className={`badge badge--${b} rule__badge`}>{BUCKET_LABEL[b]}</Label>
              <Text slot="description" className="rule__desc">
                {DESCRIPTIONS[b]}
              </Text>
              <div className="rule__input">
                <Input inputMode="numeric" />
                <span aria-hidden>%</span>
              </div>
              <Button size="s" className="rule__reset" onPress={() => setPcts((p) => ({ ...p, [b]: String(DEFAULTS[b]) }))}>
                Reset to {DEFAULTS[b]}%<span className="visually-hidden"> for {BUCKET_LABEL[b]}</span>
              </Button>
            </TextField>
          ))}
        </div>
        <div className="allocation" aria-hidden>
          {BUCKETS.map((b) => (
            <span key={b} style={{ flexGrow: Math.max(values[b], 0), background: BUCKET_BAR[b] }} />
          ))}
          {total < 100 && <span style={{ flexGrow: 100 - total, background: "var(--budget-track)" }} />}
        </div>
        <div className="allocation__meta">
          <span id="allocation-status" className={total === 100 ? "text-success" : "text-danger"} aria-live="polite">
            {total === 100 ? "100% allocated" : total < 100 ? `${total}% allocated · ${100 - total}% left to assign` : `${total}% allocated · ${total - 100}% over`}
          </span>
          <span className="text-secondary">Default: 50% needs · 30% wants · 20% savings</span>
        </div>
      </section>

      <section className="card card--panel settings-card" aria-labelledby="goals-heading">
        <div>
          <h2 id="goals-heading" className="card__title">
            Financial goals
          </h2>
          <p className="card__subtitle">Set your target and enter the amounts you already have.</p>
        </div>
        <TextField
          className="field goal-field"
          value={groupINR(goal)}
          onChange={(v) => setGoal(v.replace(/\D/g, "").slice(0, 12))}
          isInvalid={goalRupees <= 0}
          validationBehavior="aria"
        >
          <Label className="field__label">Goal amount</Label>
          <div className="field__affix">
            <span aria-hidden>₹</span>
            <Input inputMode="numeric" />
          </div>
          <Text slot="description" className="field__hint">
            The total amount you want to reach.
          </Text>
          {goalRupees <= 0 && (
            <Text slot="errorMessage" className="field__error">
              Enter a goal amount more than ₹0.
            </Text>
          )}
        </TextField>
      </section>

      <section className="card card--panel settings-card" aria-labelledby="reminders-heading">
        <div>
          <h2 id="reminders-heading" className="card__title">
            Renewal reminders
          </h2>
          <p className="card__subtitle">Get a Windows notification before an active subscription renews, so there’s money in the account that pays for it.</p>
        </div>
        <div className="reminder-row">
          <Toggle label="Remind me before renewals" isSelected={reminders} onChange={setReminders} />
          <div className="reminder-row__days">
            <SelectField label="When" value={days} onChange={setDays} options={DAY_OPTIONS} isDisabled={!reminders} />
          </div>
        </div>
        <p className="field__hint">Reminders appear while Sparro is open, once per renewal. Paused and cancelled subscriptions are never included.</p>
      </section>

      <section className="card card--panel settings-card" aria-labelledby="data-heading">
        <div className="settings-card__head">
          <div>
            <h2 id="data-heading" className="card__title">
              Your data
            </h2>
            <p className="card__subtitle">
              Everything stays on this PC. Save a backup file to a USB drive or cloud folder so you can restore it on a new PC or after a problem.
            </p>
          </div>
        </div>
        <div className="data-actions">
          <Button size="l" onPress={backup} isDisabled={busy}>
            Back up…
          </Button>
          <Button size="l" onPress={pickRestore} isDisabled={busy}>
            Restore from backup…
          </Button>
        </div>
        <p className="field__hint">To export expenses for Excel, use Export CSV on the Expenses page.</p>
      </section>

      <div className="settings-actions">
        <Button size="l" onPress={reset} isDisabled={!dirty}>
          Cancel
        </Button>
        <Button size="l" variant="primary" type="submit" isDisabled={!valid || !dirty || save.isPending}>
          Save changes
        </Button>
      </div>

      {restorePath && (
        <ConfirmDelete
          isOpen
          title="Restore this backup?"
          description="All the data in Sparro now will be replaced with the data in this backup."
          summaryTitle={fileName(restorePath)}
          summaryDetail={restorePath}
          warning="This cannot be undone. Back up first if you might need your current data."
          confirmLabel="Restore backup"
          onClose={() => setRestorePath(null)}
          onConfirm={async () => {
            await api.data.restore(restorePath);
            await qc.invalidateQueries();
            toast("Backup restored.");
          }}
        />
      )}

      {blocker.state === "blocked" && (
        <FormDialog
          isOpen
          title="Leave without saving?"
          role="alertdialog"
          danger
          submitLabel="Leave without saving"
          cancelLabel="Stay on this page"
          onSubmit={() => blocker.proceed?.()}
          onClose={() => {
            if (blocker.state === "blocked") blocker.reset?.();
          }}
        >
          <p className="dialog__note" style={{ fontSize: 14 }}>
            You changed your settings but haven’t saved them. If you leave now, those changes will be lost.
          </p>
        </FormDialog>
      )}
    </form>
  );
}
