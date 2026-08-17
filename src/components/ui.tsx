import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { useI18n, type TranslationKey } from '@/i18n';
import type { BetStatus } from '@/core/types';

/* ------------------------------------------------------------------ *
 * Cards, tiles, empty states
 * ------------------------------------------------------------------ */

export function Card({
  title,
  action,
  hint,
  flush,
  className = '',
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  hint?: ReactNode;
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`card${flush ? ' card--flush' : ''} ${className}`.trim()}>
      {(title || action) && (
        <header className="card__head" style={flush ? { padding: '14px 16px 0' } : undefined}>
          {title && <h2 className="card__title">{title}</h2>}
          {action}
        </header>
      )}
      {hint && (
        <p className="card__hint" style={{ marginBottom: 12, ...(flush ? { padding: '0 16px' } : {}) }}>
          {hint}
        </p>
      )}
      {children}
    </section>
  );
}

export type Tone = 'positive' | 'negative' | 'neutral' | 'default';

function toneClass(tone: Tone): string {
  if (tone === 'positive') return 'is-positive';
  if (tone === 'negative') return 'is-negative';
  if (tone === 'neutral') return 'is-neutral';
  return '';
}

/** Picks the tone from a signed number, so profit colouring is consistent. */
export function signTone(value: number): Tone {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

export function Stat({
  label,
  value,
  sub,
  tone = 'default',
  title,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  title?: string;
}) {
  return (
    <div className="stat" title={title}>
      <div className="stat__label">{label}</div>
      <div className={`stat__value ${toneClass(tone)}`.trim()}>{value}</div>
      {sub !== undefined && sub !== null && <div className="stat__sub">{sub}</div>}
    </div>
  );
}

export function EmptyState({
  icon = '📭',
  title,
  message,
  action,
}: {
  icon?: string;
  title?: ReactNode;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      {title && <div className="empty__title">{title}</div>}
      {message && <div className="small">{message}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Form controls
 * ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="field">
      {label && <span className="field__label">{label}</span>}
      {children}
      {error ? (
        <span className="field__error">{error}</span>
      ) : (
        hint && <span className="field__hint">{hint}</span>
      )}
    </label>
  );
}

export interface Option<T extends string = string> {
  value: T;
  label: ReactNode;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: T | '';
  onChange: (value: T) => void;
  options: Option<T>[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className="select"
      value={value}
      disabled={disabled}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value as T)}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {typeof o.label === 'string' ? o.label : String(o.value)}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  block,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  block?: boolean;
}) {
  return (
    <div className={`segmented${block ? ' segmented--block' : ''}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={`segmented__item${value === o.value ? ' is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Numeric input that keeps the raw text while editing, so typing "2." or
 * clearing the field does not fight the caret. Commits a number on change.
 */
export function NumberInput({
  value,
  onChange,
  placeholder,
  min,
  step = 'any',
  allowEmpty = true,
  disabled,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  min?: number;
  step?: string | number;
  allowEmpty?: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const focused = useRef(false);

  // Track external changes, but never yank the text out from under the caret.
  useEffect(() => {
    if (!focused.current) setText(value === undefined ? '' : String(value));
  }, [value]);

  return (
    <input
      className="input input--num"
      type="number"
      inputMode="decimal"
      value={text}
      min={min}
      step={step}
      disabled={disabled}
      placeholder={placeholder}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setText(value === undefined ? '' : String(value));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw === '') {
          onChange(allowEmpty ? undefined : 0);
          return;
        }
        const parsed = Number(raw.replace(',', '.'));
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
    />
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  list,
  type = 'text',
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  list?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      className="input"
      type={type}
      value={value}
      list={list}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** Free-form tag entry: type and press Enter or comma to commit. */
export function TagInput({
  tags,
  onChange,
  placeholder,
  suggestions = [],
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState('');
  const listId = useRef(`tags-${Math.random().toString(36).slice(2)}`).current;

  const commit = useCallback(
    (raw: string) => {
      const value = raw.trim();
      if (!value || tags.includes(value)) {
        setDraft('');
        return;
      }
      onChange([...tags, value]);
      setDraft('');
    },
    [tags, onChange],
  );

  return (
    <div className="stack" style={{ gap: 7 }}>
      {tags.length > 0 && (
        <div className="chip-row">
          {tags.map((tag) => (
            <span key={tag} className="chip">
              {tag}
              <button
                type="button"
                className="chip__remove"
                aria-label={`remove ${tag}`}
                onClick={() => onChange(tags.filter((t) => t !== tag))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="input"
        value={draft}
        list={listId}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          // A comma finishes the tag, matching how people type lists.
          if (raw.endsWith(',')) commit(raw.slice(0, -1));
          else setDraft(raw);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(draft);
          } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => commit(draft)}
      />
      <datalist id={listId}>
        {suggestions.filter((s) => !tags.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Modal
 * ------------------------------------------------------------------ */

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  // Escape closes, and the page behind must not scroll while a sheet is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`sheet${wide ? ' sheet--wide' : ''}`} role="dialog" aria-modal="true">
        <header className="sheet__head">
          <h2 className="card__title">{title}</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} aria-label="close">
            ✕
          </button>
        </header>
        <div className="sheet__body">{children}</div>
        {footer && <footer className="sheet__foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  message: ReactNode;
  confirmLabel?: ReactNode;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal
      title={t('action.confirm')}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            {t('action.cancel')}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel ?? t('action.confirm')}
          </button>
        </>
      }
    >
      <p style={{ lineHeight: 1.6 }}>{message}</p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Status badge
 * ------------------------------------------------------------------ */

const STATUS_KEYS: Record<BetStatus, TranslationKey> = {
  pending: 'status.pending',
  won: 'status.won',
  lost: 'status.lost',
  void: 'status.void',
  partial: 'status.partial',
  cashed_out: 'status.cashed_out',
};

export function StatusBadge({ status }: { status: BetStatus }) {
  const { t } = useI18n();
  return <span className={`badge badge--${status}`}>{t(STATUS_KEYS[status])}</span>;
}

/* ------------------------------------------------------------------ *
 * Toast
 * ------------------------------------------------------------------ */

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3200);
    return () => clearTimeout(timer);
  }, [message, onDone]);
  return <div className="toast">{message}</div>;
}

/** Toast state hook: `show(message)` and render `toast`. */
export function useToast(): { toast: ReactNode; show: (message: string) => void } {
  const [message, setMessage] = useState<string | null>(null);
  const show = useCallback((next: string) => setMessage(next), []);
  const toast = message ? <Toast message={message} onDone={() => setMessage(null)} /> : null;
  return { toast, show };
}

/* ------------------------------------------------------------------ *
 * File picker button
 * ------------------------------------------------------------------ */

export function FilePicker({
  accept,
  onFile,
  children,
  className = 'btn',
}: {
  accept: string;
  onFile: (text: string, filename: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => inputRef.current?.click()}>
        {children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const text = await file.text();
          onFile(text, file.name);
          // Reset so picking the same file twice still fires a change event.
          e.target.value = '';
        }}
      />
    </>
  );
}
