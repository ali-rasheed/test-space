/**
 * Radix Select wired to uiConstants (selectTrigger, selectContent, selectItem).
 * Value is always string from Radix; parent may coerce to number.
 * Tooltip wraps only the trigger (not Portal content) so footer inputs do not bubble
 * to Tooltip.Trigger via React portal event propagation.
 * @param {{ value: string | number, onValueChange: (v: string) => void, options: Array<{ value: string | number, label: string, icon?: string }>, placeholder?: string, title?: string, id?: string, labelText?: string, defaultValue?: string | number, onReset?: () => void, contentFooter?: import('react').ReactNode }} props
 */
import * as Select from '@radix-ui/react-select';
import * as Label from '@radix-ui/react-label';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { AppTooltip } from './AppTooltip';
import { selectTrigger, selectContent, selectItem, iconMd, iconLg, iconResetGlyphMd } from '../../uiConstants';

/** Bubble-phase guard: Radix Select close + portal bubbling to ancestors (e.g. tooltip trigger). */
function keepSelectOpenOnFooterPointer(event) {
  event.preventDefault();
  event.stopPropagation();
}

export function AppSelect({ value, onValueChange, options, placeholder, title, id: idProp, labelText, defaultValue, onReset, contentFooter }) {
  const selected = options.find((o) => String(o.value) === String(value));
  const label = labelText ?? title;
  const isDirty = defaultValue != null && String(value) !== String(defaultValue);
  const trigger = (
    <Select.Trigger id={idProp} className={selectTrigger} aria-label={title ?? placeholder}>
      <span className="flex min-w-0 items-center gap-1.5">
        {selected?.icon && (
          <Icon name={selected.icon} className={`shrink-0 ${iconMd} text-text-muted`} />
        )}
        <Select.Value placeholder={placeholder} />
      </span>
      <Icon name="expand_more" className={`${iconLg} opacity-60`} />
    </Select.Trigger>
  );
  return (
    <>
      {idProp && label && (
        <Label.Root className="sr-only" htmlFor={idProp}>
          {label}
        </Label.Root>
      )}
      <div className="inline-flex cursor-default items-center gap-1">
        <Select.Root value={String(value)} onValueChange={onValueChange}>
          {title ? <AppTooltip content={title}>{trigger}</AppTooltip> : trigger}
          <Select.Portal>
            <Select.Content className={selectContent} position="popper" sideOffset={4}>
              <Select.Viewport>
                {options.map((opt, i) => (
                  <Select.Item
                    key={opt.id ?? i}
                    className={selectItem}
                    value={String(opt.value)}
                  >
                    {opt.icon && (
                      <Icon name={opt.icon} className={`mr-1.5 shrink-0 ${iconMd} text-text-muted`} />
                    )}
                    <Select.ItemText>{opt.label}</Select.ItemText>
                    <Select.ItemIndicator className="absolute right-2 inline-flex items-center" />
                  </Select.Item>
                ))}
              </Select.Viewport>
              {contentFooter != null ? (
                <div
                  className="border-t border-border-subtle"
                  data-app-select-footer=""
                  onPointerDown={keepSelectOpenOnFooterPointer}
                >
                  {contentFooter}
                </div>
              ) : null}
            </Select.Content>
          </Select.Portal>
        </Select.Root>
        {isDirty && onReset && (
          <IconButton size="resetSm" onClick={onReset} title={`Reset ${title ?? placeholder ?? 'select'} to default`} aria-label={`Reset ${title ?? placeholder ?? 'select'} to default`}>
            <Icon name="restart_alt" className={iconResetGlyphMd} />
          </IconButton>
        )}
      </div>
    </>
  );
}
