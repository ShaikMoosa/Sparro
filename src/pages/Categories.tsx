import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button as AriaButton, Label, Radio, RadioGroup } from "react-aria-components";

import { api, useCategories, useSave } from "../api";
import type { Bucket } from "../bindings/Bucket";
import type { Category } from "../bindings/Category";
import { BucketBadge, Button, ConfirmDelete, FormDialog, PageHeader, SelectField, TextInput, useToast } from "../components/ui";
import { BUCKETS, BUCKET_DESCRIPTION, BUCKET_LABEL, PALETTE, PALETTE_LABELS, categoryColors, colorName, isPaletteKey } from "../lib/colors";
import { plural } from "../lib/format";

export function CategoriesPage() {
  const { data: categories = [] } = useCategories();
  const [dialog, setDialog] = useState<{ open: boolean; category?: Category; bucket?: Bucket }>({ open: false });
  const [deleting, setDeleting] = useState<Category | null>(null);

  return (
    <div className="page">
      <PageHeader title="Categories" description="Organize your categories by bucket and give each one a color." />
      <div className="bucket-columns">
        {BUCKETS.map((bucket) => {
          const items = categories.filter((c) => c.bucket === bucket);
          return (
            <section key={bucket} className="card card--panel bucket-column" aria-labelledby={`bucket-${bucket}`}>
              <div className="bucket-column__head">
                <h2 id={`bucket-${bucket}`}>{BUCKET_LABEL[bucket]}</h2>
                <span className={`badge badge--${bucket}`} aria-label={plural(items.length, "category", "categories")}>
                  {items.length}
                </span>
              </div>
              <p className="bucket-column__desc">{BUCKET_DESCRIPTION[bucket]}</p>
              {items.length === 0 ? (
                <p className="empty__hint bucket-column__empty">No categories in {BUCKET_LABEL[bucket]}. Add one so you can log entries here.</p>
              ) : (
                <ul className="category-list">
                  {items.map((c) => (
                    <li key={c.id} className="category-row">
                      <span className="swatch" style={{ background: categoryColors(c.color).fg }} aria-hidden />
                      <span className="category-row__text">
                        <span className="category-row__name">{c.name}</span>
                        <span className="category-row__color">{colorName(c.color)}</span>
                      </span>
                      <AriaButton className="icon-btn icon-btn--lg" aria-label={`Edit ${c.name}`} onPress={() => setDialog({ open: true, category: c })}>
                        <Pencil size={16} aria-hidden />
                      </AriaButton>
                      <AriaButton className="icon-btn icon-btn--lg icon-btn--danger" aria-label={`Delete ${c.name}`} onPress={() => setDeleting(c)}>
                        <Trash2 size={16} aria-hidden />
                      </AriaButton>
                    </li>
                  ))}
                </ul>
              )}
              <Button variant="primary" size="l" className="bucket-column__add" onPress={() => setDialog({ open: true, bucket })}>
                Add category<span className="visually-hidden"> to {BUCKET_LABEL[bucket]}</span>
              </Button>
            </section>
          );
        })}
      </div>
      <p className="page-footnote">Colors identify categories in expenses and subscriptions. Edit a category to rename it, move its bucket or change its color.</p>

      <CategoryDialog
        isOpen={dialog.open}
        category={dialog.category}
        defaultBucket={dialog.bucket}
        onClose={() => setDialog({ open: false })}
      />
      {deleting && <DeleteCategoryDialog category={deleting} categories={categories} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function CategoryDialog({ isOpen, onClose, category, defaultBucket }: { isOpen: boolean; onClose: () => void; category?: Category; defaultBucket?: Bucket }) {
  const toast = useToast();
  const editing = !!category;
  const [name, setName] = useState("");
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [color, setColor] = useState<string>("blue");
  const [hex, setHex] = useState("");
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setName(category?.name ?? "");
    setBucket(category?.bucket ?? defaultBucket ?? null);
    const c = category?.color ?? "blue";
    setColor(isPaletteKey(c) ? c : "custom");
    setHex(isPaletteKey(c) ? "" : c);
    setSubmitted(false);
  }, [isOpen, category, defaultBucket]);

  const hexValid = /^#[0-9a-fA-F]{6}$/.test(hex.trim());
  const finalColor = color === "custom" ? hex.trim().toLowerCase() : color;
  const errors = {
    name: !name.trim() ? "Enter a category name." : null,
    bucket: !bucket ? "Choose a bucket." : null,
    hex: color === "custom" && !hexValid ? "Enter a hex code like #4F46E5." : null,
  };
  const save = useSave(async () => {
    const input = { name: name.trim(), bucket: bucket!, color: finalColor };
    return editing ? api.categories.update(category!.id, input) : api.categories.create(input);
  });
  const preview = categoryColors(color === "custom" && !hexValid ? "blue" : finalColor);

  return (
    <FormDialog
      title={editing ? "Edit category" : "Add category"}
      subtitle={editing ? "Update the name, bucket or assigned color." : undefined}
      isOpen={isOpen}
      onClose={onClose}
      cancelLabel="Cancel"
      submitLabel={editing ? "Save changes" : "Add category"}
      onSubmit={async () => {
        setSubmitted(true);
        if (Object.values(errors).some(Boolean)) throw { message: "Please fix the highlighted fields." };
        await save.mutateAsync(undefined);
        toast(editing ? "Category updated." : "Category added.");
      }}
    >
      <TextInput label="Category name" value={name} onChange={setName} placeholder="Eg: Education" required maxLength={40} error={submitted ? errors.name : null} autoFocus />
      <SelectField label="Bucket" value={bucket} onChange={setBucket} options={BUCKETS.map((b) => ({ id: b, label: BUCKET_LABEL[b] }))} placeholder="Select bucket" required error={submitted ? errors.bucket : null} />
      {editing && category && category.bucket !== bucket && category.entryCount > 0 && (
        <p className="field__hint">{plural(category.entryCount, "existing entry", "existing entries")} will move to {bucket ? BUCKET_LABEL[bucket] : "the new bucket"} as well.</p>
      )}
      <RadioGroup className="field" value={color} onChange={setColor} orientation="horizontal">
        <Label className="field__label">Category color</Label>
        <div className="palette">
          {PALETTE.map((p) => (
            <Radio key={p} value={p} className="palette__swatch" aria-label={PALETTE_LABELS[p]} style={{ background: `var(--cat-${p}-fg)` }} />
          ))}
          <Radio value="custom" className="palette__custom">
            Custom
          </Radio>
        </div>
        <span className="field__hint" aria-live="polite">
          Selected: {color === "custom" ? (hexValid ? hex.toUpperCase() : "custom hex") : PALETTE_LABELS[color as keyof typeof PALETTE_LABELS]}
        </span>
      </RadioGroup>
      {color === "custom" && <TextInput label="Hex color" value={hex} onChange={setHex} placeholder="#4F46E5" required maxLength={7} error={submitted || hex.length === 7 ? errors.hex : null} />}
      <div className="summary-box">
        <span>Preview</span>
        <span className="category-preview">
          <span className="cat-initial" style={{ background: preview.bg }} aria-hidden>
            {(name.trim() || "E").charAt(0).toUpperCase()}
          </span>
          <strong>{name.trim() || "Education"}</strong>
          {bucket && <BucketBadge bucket={bucket} />}
        </span>
        <span>Color changes apply wherever this category appears.</span>
      </div>
    </FormDialog>
  );
}

function DeleteCategoryDialog({ category, categories, onClose }: { category: Category; categories: Category[]; onClose: () => void }) {
  const toast = useToast();
  const others = categories.filter((c) => c.id !== category.id);
  const sameBucket = others.find((c) => c.bucket === category.bucket);
  const [replacement, setReplacement] = useState<number | null>(sameBucket?.id ?? others[0]?.id ?? null);
  const needsMove = category.entryCount > 0;
  const remove = useSave(() => api.categories.remove(category.id, needsMove ? replacement : null));
  const chosen = others.find((c) => c.id === replacement);

  return (
    <ConfirmDelete
      isOpen
      title="Delete this category?"
      description={
        needsMove
          ? `Move existing entries to another category before removing ${category.name}. Your transactions will not be deleted.`
          : `${category.name} has no entries, so nothing else changes.`
      }
      summaryTitle={category.name}
      summaryDetail={`${BUCKET_LABEL[category.bucket]} · ${colorName(category.color)} · ${plural(category.entryCount, "entry", "entries")}`}
      warning="This cannot be undone. Transaction amounts and dates stay unchanged."
      confirmLabel="Delete category"
      canConfirm={!needsMove || replacement != null}
      onClose={onClose}
      onConfirm={async () => {
        await remove.mutateAsync(undefined);
        toast(`${category.name} deleted.`);
      }}
    >
      {needsMove && (
        <>
          <SelectField
            label="Move entries to"
            value={replacement}
            onChange={setReplacement}
            options={others.map((c) => ({ id: c.id, label: c.name, section: BUCKET_LABEL[c.bucket] }))}
            required
          />
          <p className="dialog__note">
            {chosen && chosen.bucket !== category.bucket
              ? `${chosen.name} is in ${BUCKET_LABEL[chosen.bucket]}, so these entries will count toward that bucket instead.`
              : "Choose a replacement in the same bucket to keep budget totals unchanged."}
          </p>
        </>
      )}
    </ConfirmDelete>
  );
}
