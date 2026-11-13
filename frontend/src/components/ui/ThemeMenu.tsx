import { useI18n } from '../../i18n';
import { useTheme, THEME_CHOICES, type ThemeChoice } from '../../theme';
import { Menu, MenuItem } from './Menu';
import Icon from './Icon';

const ICON = { dark: 'moon', light: 'sun', system: 'monitor' } as const;

// Theme selector: dark, light or the system's setting
export default function ThemeMenu() {
  const { choice, theme, setChoice } = useTheme();
  const { t } = useI18n();
  return (
    <Menu triggerClassName="icon-btn" ariaLabel={`${t('theme.label')}: ${t(`theme.${choice}`)}`}
      label={<Icon name={choice === 'system' ? 'monitor' : ICON[theme]} />}>
      {THEME_CHOICES.map((c: ThemeChoice) => (
        <MenuItem key={c} icon={ICON[c]} checked={choice === c} onSelect={() => setChoice(c)}>{t(`theme.${c}`)}</MenuItem>
      ))}
    </Menu>
  );
}

// The same choice as a segmented control (mobile menu)
export function ThemeSwitch() {
  const { choice, setChoice } = useTheme();
  const { t } = useI18n();
  return (
    <div className="seg" role="group" aria-label={t('theme.label')}>
      {THEME_CHOICES.map((c) => (
        <button key={c} type="button" aria-pressed={choice === c} title={t(`theme.${c}`)} onClick={() => setChoice(c)}>
          <Icon name={ICON[c]} className="seg-icon" /> {t(`theme.${c}`)}
        </button>
      ))}
    </div>
  );
}
