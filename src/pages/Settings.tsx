import { useEffect, useState } from "react";
import { Input, Label, Text, TextField } from "react-aria-components";

import { api, useSave, useSettings } from "../api";
import type { Bucket } from "../bindings/Bucket";
import { Button, PageHeader, useToast } from "../components/ui";
import { BUCKETS, BUCKET_BAR, BUCKET_LABEL } from "../lib/colors";
import { errorMessage } from "../api/client";

const DEFAULTS: Record<Bucket, number> = { needs: 50, wants: 30, savings: 20 };
const DESCRIPTIONS: Record<Bucket, string> = {
  needs: "Essentials and regular commitments",
  wants: "Lifestyle, leisure and the little extras",
  savings: "Build your future, one goal at a time",
};

const groupINR = (digits: string) => (digits ? new Intl.NumberFormat("en-IN").format(Number(digits)) : "");

export function SettingsPage() {
  const toast = useToast();
  const { data: settings } = useSettings();
  const [pcts, setPcts] = useState<Record<Bucket, string>>({ needs: "50", wants: "30", savings: "20" });
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    if (!settings) return;
    setPcts({ needs: String(settings.needsPct), wants: String(settings.wantsPct), savings: String(settings.savingsPct) });
    setGoal(String(Math.round(settings.goalAmount / 100)));
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
    (values.needs !== settings.needsPct || values.wants !== settings.wantsPct || values.savings !== settings.savingsPct || goalRupees * 100 !== settings.goalAmount);

  const save = useSave(() => api.settings.save({ needsPct: values.needs, wantsPct: values.wants, savingsPct: values.savings, goalAmount: goalRupees * 100 }));

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
                <Input inputMode="numeric" aria-describedby="allocation-status" />
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

      <div className="settings-actions">
        <Button size="l" onPress={reset} isDisabled={!dirty}>
          Cancel
        </Button>
        <Button size="l" variant="primary" type="submit" isDisabled={!valid || !dirty || save.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
