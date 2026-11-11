import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Trash2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Button as AriaButton,
  Dialog,
  Header,
  Heading,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Modal,
  ModalOverlay,
  Popover,
  Select,
  SelectValue,
  Switch,
  Text,
  TextField,
  type ButtonProps as AriaButtonProps,
  type Key,
} from "react-aria-components";

import type { Bucket } from "../bindings/Bucket";
import { errorMessage } from "../api/client";
import { BUCKET_LABEL, categoryColors } from "../lib/colors";
import { monthName, shiftMonth } from "../lib/format";

// ---------------- Buttons ----------------

type ButtonProps = AriaButtonProps & {
  variant?: "primary" | "secondary" | "danger" | "link";
  size?: "s" | "m" | "l";
  emphasis?: boolean;
};

export function Button({ variant = "secondary", size = "m", emphasis, className, ...rest }: ButtonProps) {
  const cls = ["btn", `btn--${size}`, variant !== "secondary" && `btn--${variant}`, emphasis && "btn--emphasis", className]
    .filter(Boolean)
    .join(" ");
  return <AriaButton {...rest} className={cls} />;
}

/** Row-level edit / delete with a spoken name, e.g. "Edit Home loan EMI". */
export function RowActions({ label, onEdit, onDelete }: { label: string; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <div className="row-actions">
      {onEdit && (
        <AriaButton className="icon-btn" aria-label={`Edit ${label}`} onPress={onEdit}>
          <Pencil size={12} strokeWidth={2} aria-hidden />
        </AriaButton>
      )}
      {onDelete && (
        <AriaButton className="icon-btn" aria-label={`Delete ${label}`} onPress={onDelete}>
          <Trash2 size={12} strokeWidth={2} aria-hidden />
        </AriaButton>
      )}
    </div>
  );
}

// ---------------- Dialogs ----------------

type FormDialogProps = {
  title: string;
  subtitle?: string;
  isOpen: boolean;
  onClose: () => void;
  /** Return normally to close; throw to show the error in the dialog. */
  onSubmit: () => Promise<void> | void;
  submitLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When false, the primary button stays disabled (e.g. invalid totals). */
  canSubmit?: boolean;
  role?: "dialog" | "alertdialog";
  children: ReactNode;
};

export function FormDialog({
  title,
  subtitle,
  isOpen,
  onClose,
  onSubmit,
  submitLabel,
  cancelLabel = "Discard",
  danger,
  canSubmit = true,
  role = "dialog",
  children,
}: FormDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  // Each opening starts clean: no leftover error from a previous attempt.
  useEffect(() => {
    if (isOpen) setError(null);
  }, [isOpen]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      isDismissable={!busy}
      className="modal-overlay"
    >
      <Modal className="modal">
        <Dialog className="dialog" role={role}>
          <div className="dialog__header">
            <div style={{ flex: 1 }}>
              <Heading slot="title" className="dialog__title">
                {title}
              </Heading>
              {subtitle && <p className="dialog__subtitle">{subtitle}</p>}
            </div>
            <AriaButton className="dialog__close" aria-label="Close" onPress={onClose}>
              <X size={20} aria-hidden />
            </AriaButton>
          </div>
          <form className="dialog__body" onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="form-error" role="alert" tabIndex={-1} ref={errorRef}>
                {error}
              </div>
            )}
            {children}
            <div className="dialog__actions">
              {/* Destructive dialogs lead with Cancel, as in the Figma delete dialogs. */}
              {danger && (
                <Button size="l" onPress={onClose}>
                  {cancelLabel}
                </Button>
              )}
              <Button type="submit" size="l" variant={danger ? "danger" : "primary"} isDisabled={busy || !canSubmit}>
                {submitLabel}
              </Button>
              {!danger && (
                <Button size="l" onPress={onClose}>
                  {cancelLabel}
                </Button>
              )}
            </div>
          </form>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/** Delete confirmation in the shared style of the Investments / Subscriptions delete dialogs. */
export function ConfirmDelete({
  title,
  description,
  summaryTitle,
  summaryDetail,
  warning = "This action cannot be undone.",
  confirmLabel,
  isOpen,
  onClose,
  onConfirm,
  canConfirm,
  children,
}: {
  title: string;
  description: string;
  summaryTitle: string;
  summaryDetail?: string;
  warning?: string;
  confirmLabel: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  canConfirm?: boolean;
  children?: ReactNode;
}) {
  return (
    <FormDialog
      title={title}
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={onConfirm}
      submitLabel={confirmLabel}
      cancelLabel="Cancel"
      danger
      role="alertdialog"
      canSubmit={canConfirm}
    >
      <p className="dialog__note" style={{ fontSize: 14 }}>
        {description}
      </p>
      <div className="summary-box">
        <strong>{summaryTitle}</strong>
        {summaryDetail && <span>{summaryDetail}</span>}
      </div>
      {children}
      <p className="dialog__warning">{warning}</p>
    </FormDialog>
  );
}

// ---------------- Fields ----------------

function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <Label className="field__label">
      {children}
      {required && (
        <span className="field__required" aria-hidden>
          *
        </span>
      )}
    </Label>
  );
}

type TextInputProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  maxLength?: number;
  autoFocus?: boolean;
  inputMode?: "text" | "decimal" | "numeric";
};

export function TextInput({ label, value, onChange, placeholder, required, error, hint, maxLength, autoFocus, inputMode }: TextInputProps) {
  return (
    <TextField
      className="field"
      value={value}
      onChange={onChange}
      isRequired={required}
      isInvalid={!!error}
      maxLength={maxLength}
      autoFocus={autoFocus}
      validationBehavior="aria"
    >
      <FieldLabel required={required}>{label}</FieldLabel>
      <Input className="field__input" placeholder={placeholder} inputMode={inputMode} />
      {hint && !error && (
        <Text slot="description" className="field__hint">
          {hint}
        </Text>
      )}
      {error && (
        <Text slot="errorMessage" className="field__error">
          {error}
        </Text>
      )}
    </TextField>
  );
}

/** Rupee amount; the value is the text the user typed, parsed by the caller. */
export function AmountInput({
  label,
  value,
  onChange,
  required,
  error,
  hint,
  placeholder = "Enter amount",
}: Omit<TextInputProps, "maxLength" | "inputMode">) {
  return (
    <TextField className="field" value={value} onChange={onChange} isRequired={required} isInvalid={!!error} validationBehavior="aria">
      <FieldLabel required={required}>
        {label}
        <span className="visually-hidden"> in rupees</span>
      </FieldLabel>
      <div className="field__affix" data-invalid={!!error}>
        <span aria-hidden>₹</span>
        <Input placeholder={placeholder} inputMode="decimal" />
      </div>
      {hint && !error && (
        <Text slot="description" className="field__hint">
          {hint}
        </Text>
      )}
      {error && (
        <Text slot="errorMessage" className="field__error">
          {error}
        </Text>
      )}
    </TextField>
  );
}

export type DateParts = { d: string; m: string; y: string };

export function partsFromISO(iso: string | null | undefined): DateParts {
  if (!iso) return { d: "", m: "", y: "" };
  const [y, m, d] = iso.split("-");
  return { d: String(Number(d)), m: String(Number(m)), y };
}

/** Valid `YYYY-MM-DD` or null. */
export function partsToISO(p: DateParts): string | null {
  const d = Number(p.d), m = Number(p.m), y = Number(p.y);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !/^\d{4}$/.test(p.y)) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** DD / MM / YYYY boxes from the design, grouped and labelled for screen readers. */
export function DateInput({
  label,
  value,
  onChange,
  required,
  error,
}: {
  label: string;
  value: DateParts;
  onChange: (p: DateParts) => void;
  required?: boolean;
  error?: string | null;
}) {
  const id = useId();
  const errId = `${id}-err`;
  const part = (key: keyof DateParts, ph: string, name: string, max: number) => (
    <input
      className="field__input"
      inputMode="numeric"
      autoComplete="off"
      placeholder={ph}
      aria-label={`${label}: ${name}`}
      aria-invalid={!!error || undefined}
      aria-describedby={error ? errId : undefined}
      aria-required={required || undefined}
      maxLength={max}
      value={value[key]}
      onChange={(e) => onChange({ ...value, [key]: e.target.value.replace(/\D/g, "") })}
    />
  );
  return (
    <div className="field">
      <fieldset className="date-parts" aria-describedby={error ? errId : undefined}>
        <legend className="field__label">
          {label}
          {required && (
            <span className="field__required" aria-hidden>
              {" "}*
            </span>
          )}
        </legend>
        {part("d", "DD", "day", 2)}
        {part("m", "MM", "month", 2)}
        {part("y", "YYYY", "year", 4)}
      </fieldset>
      {error && (
        <span id={errId} className="field__error">
          {error}
        </span>
      )}
    </div>
  );
}

export type Option<K extends Key> = { id: K; label: string; section?: string; description?: string };

export function SelectField<K extends Key>({
  label,
  value,
  onChange,
  options,
  placeholder = "Select",
  required,
  error,
  hint,
  isDisabled,
}: {
  label: string;
  value: K | null;
  onChange: (v: K) => void;
  options: Option<K>[];
  placeholder?: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  isDisabled?: boolean;
}) {
  const sections = [...new Set(options.map((o) => o.section).filter(Boolean))] as string[];
  return (
    <Select
      className="field"
      selectedKey={value}
      onSelectionChange={(k) => k != null && onChange(k as K)}
      isRequired={required}
      isInvalid={!!error}
      isDisabled={isDisabled}
      placeholder={placeholder}
      validationBehavior="aria"
    >
      <FieldLabel required={required}>{label}</FieldLabel>
      <AriaButton className="select-trigger" data-invalid={error ? true : undefined}>
        <SelectValue />
        <ChevronDown size={20} aria-hidden />
      </AriaButton>
      {hint && !error && (
        <Text slot="description" className="field__hint">
          {hint}
        </Text>
      )}
      {error && (
        <Text slot="errorMessage" className="field__error">
          {error}
        </Text>
      )}
      <Popover className="select-popover" placement="bottom start">
        <ListBox>
          {sections.length
            ? sections.map((s) => (
                <ListBoxSection key={s} id={s}>
                  <Header className="select-section-header">{s}</Header>
                  {options
                    .filter((o) => o.section === s)
                    .map((o) => (
                      <ListBoxItem key={String(o.id)} id={o.id} className="select-option" textValue={o.label}>
                        {o.label}
                      </ListBoxItem>
                    ))}
                </ListBoxSection>
              ))
            : options.map((o) => (
                <ListBoxItem key={String(o.id)} id={o.id} className="select-option" textValue={o.label}>
                  {o.label}
                </ListBoxItem>
              ))}
        </ListBox>
      </Popover>
    </Select>
  );
}

/** Compact select used in the Expenses filter bar. */
export function FilterSelect<K extends Key>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: K;
  onChange: (v: K) => void;
  options: Option<K>[];
}) {
  return (
    <Select className="filter" selectedKey={value} onSelectionChange={(k) => k != null && onChange(k as K)}>
      <Label className="filter__label">{label}</Label>
      <AriaButton className="filter__control filter-select">
        <SelectValue />
        <ChevronDown size={12} aria-hidden />
      </AriaButton>
      <Popover className="select-popover popover--sm" placement="bottom start">
        <ListBox>
          {options.map((o) => (
            <ListBoxItem key={String(o.id)} id={o.id} className="select-option" textValue={o.label}>
              {o.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </Select>
  );
}

export function Toggle({ label, isSelected, onChange }: { label: string; isSelected: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="field">
      <Switch className="switch" isSelected={isSelected} onChange={onChange} style={{ flexDirection: "column", alignItems: "flex-start" }}>
        <span>{label}</span>
        <span className="switch__track" aria-hidden>
          <span className="switch__thumb" />
        </span>
      </Switch>
    </div>
  );
}

// ---------------- Small display pieces ----------------

export function BucketBadge({ bucket }: { bucket: Bucket }) {
  return <span className={`badge badge--${bucket}`}>{BUCKET_LABEL[bucket]}</span>;
}

export function CategoryInitial({ name, color }: { name: string; color: string }) {
  const c = categoryColors(color);
  return (
    <span className="cat-initial" style={{ background: c.bg }} aria-hidden>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function EmptyState({
  title,
  hint,
  actionLabel,
  onAction,
  className,
}: {
  title: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={["empty", className].filter(Boolean).join(" ")}>
      <p className="empty__title">{title}</p>
      <p className="empty__hint">{hint}</p>
      {actionLabel && onAction && <Button onPress={onAction}>{actionLabel}</Button>}
    </div>
  );
}

export function MonthSwitcher({ month, onChange, max }: { month: string; onChange: (m: string) => void; max?: string }) {
  const atMax = max != null && month >= max;
  return (
    <div className="month-switcher" role="group" aria-label="Month">
      <AriaButton aria-label={`Previous month, ${monthName(shiftMonth(month, -1), true)}`} onPress={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft size={16} aria-hidden />
      </AriaButton>
      <span className="month-switcher__label" aria-live="polite">
        {monthName(month)}
        <span className="visually-hidden"> {month.slice(0, 4)}</span>
      </span>
      <AriaButton
        aria-label={`Next month, ${monthName(shiftMonth(month, 1), true)}`}
        isDisabled={atMax}
        onPress={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight size={16} aria-hidden />
      </AriaButton>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

// ---------------- Toasts ----------------

type Toast = { id: number; message: string; tone: "info" | "error" };
const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === "error" ? "toast--error" : ""}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
