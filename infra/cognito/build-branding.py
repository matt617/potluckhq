#!/usr/bin/env python3
"""
Generate Cognito managed-login branding that matches the Potluck web app.

Input:  cognito-defaults.json, the settings Cognito returns for its own default style
        (captured with DescribeManagedLoginBranding --return-merged-resources).
Output: branding.json, consumed by the CDK stack.

Colors mirror the tokens in packages/web/src/styles.css. Every path written here must
already exist in the defaults, so a Cognito schema change fails loudly instead of silently.
"""
import json
from pathlib import Path

HERE = Path(__file__).parent
s = json.loads((HERE / 'cognito-defaults.json').read_text())

LIGHT = dict(bg='fafaf9', surface='ffffff', surface2='f3f3f1', text='141413', text2='3d3d3a', muted='6b6a65',
             border='e7e6e2', borderStrong='d6d5d0', accent='2d6a4f', accentInk='ffffff', accentSoft='eaf2ec',
             accentText='24563f', ink='141413', inkHover='33332f', inkText='ffffff', danger='a3302b',
             dangerSoft='fbeceb', ok='2f6b3a', okSoft='edf3ec', warn='7a5300', warnSoft='fbf3db')
DARK = dict(bg='111110', surface='191918', surface2='22221f', text='ededea', text2='c9c8c2', muted='9c9b94',
            border='2e2e2b', borderStrong='3d3d39', accent='7cc29b', accentInk='0f1a14', accentSoft='1c2b22',
            accentText='9ad3b3', ink='ededea', inkHover='d6d6d1', inkText='111110', danger='f08a80',
            dangerSoft='3a1f1c', ok='8bcb95', okSoft='1d2b20', warn='e9c46a', warnSoft='33290f')

def c(hex6):
    return hex6 + 'ff'

def put(path, value):
    node = s
    keys = path.split('.')
    for k in keys[:-1]:
        if k not in node:
            raise KeyError(f'{path}: "{k}" is not in the Cognito defaults')
        node = node[k]
    if keys[-1] not in node:
        raise KeyError(f'{path}: "{keys[-1]}" is not in the Cognito defaults')
    node[keys[-1]] = value

def themed(prefix, mode_paths):
    """mode_paths maps a sub-path under <mode> to a token name."""
    for mode, t in (('lightMode', LIGHT), ('darkMode', DARK)):
        for sub, token in mode_paths.items():
            put(f'{prefix}.{mode}.{sub}', c(t[token]))

comp = 'components'
themed(f'{comp}.pageBackground', {'color': 'bg'})
put(f'{comp}.pageBackground.image.enabled', False)
themed(f'{comp}.pageText', {'headingColor': 'text', 'bodyColor': 'text2', 'descriptionColor': 'muted'})
themed(f'{comp}.form', {'backgroundColor': 'surface', 'borderColor': 'border'})
put(f'{comp}.form.borderRadius', 12.0)
put(f'{comp}.form.logo.enabled', True)
put(f'{comp}.form.logo.location', 'CENTER')
put(f'{comp}.form.logo.position', 'TOP')
themed(f'{comp}.primaryButton', {
    'defaults.backgroundColor': 'ink', 'defaults.textColor': 'inkText',
    'hover.backgroundColor': 'inkHover', 'hover.textColor': 'inkText',
    'active.backgroundColor': 'inkHover', 'active.textColor': 'inkText',
    'disabled.backgroundColor': 'surface2', 'disabled.borderColor': 'surface2',
})
secondary = {
    'defaults.backgroundColor': 'surface', 'defaults.borderColor': 'borderStrong', 'defaults.textColor': 'text',
    'hover.backgroundColor': 'surface2', 'hover.borderColor': 'borderStrong', 'hover.textColor': 'text',
    'active.backgroundColor': 'border', 'active.borderColor': 'borderStrong', 'active.textColor': 'text',
}
themed(f'{comp}.secondaryButton', secondary)
themed(f'{comp}.idpButton.standard', secondary)
themed(f'{comp}.alert', {'error.backgroundColor': 'dangerSoft', 'error.borderColor': 'danger'})
put(f'{comp}.alert.borderRadius', 8.0)
themed(f'{comp}.pageHeader', {'borderColor': 'border', 'background.color': 'bg'})
themed(f'{comp}.pageFooter', {'borderColor': 'border', 'background.color': 'bg'})

cls = 'componentClasses'
put(f'{cls}.buttons.borderRadius', 8.0)
put(f'{cls}.input.borderRadius', 8.0)
put(f'{cls}.dropDown.borderRadius', 8.0)
themed(f'{cls}.input', {'defaults.backgroundColor': 'surface', 'defaults.borderColor': 'borderStrong', 'placeholderColor': 'muted'})
themed(f'{cls}.inputLabel', {'textColor': 'text'})
themed(f'{cls}.inputDescription', {'textColor': 'muted'})
themed(f'{cls}.focusState', {'borderColor': 'accent'})
themed(f'{cls}.link', {'defaults.textColor': 'accentText', 'hover.textColor': 'text'})
themed(f'{cls}.divider', {'borderColor': 'border'})
themed(f'{cls}.optionControls', {
    'defaults.backgroundColor': 'surface', 'defaults.borderColor': 'borderStrong',
    'selected.backgroundColor': 'accent', 'selected.foregroundColor': 'accentInk',
})
themed(f'{cls}.dropDown', {
    'defaults.itemBackgroundColor': 'surface',
    'hover.itemBackgroundColor': 'surface2', 'hover.itemBorderColor': 'borderStrong', 'hover.itemTextColor': 'text',
    'match.itemBackgroundColor': 'accentSoft', 'match.itemTextColor': 'accentText',
})
themed(f'{cls}.statusIndicator', {
    'success.backgroundColor': 'okSoft', 'success.borderColor': 'ok', 'success.indicatorColor': 'ok',
    'warning.backgroundColor': 'warnSoft', 'warning.borderColor': 'warn', 'warning.indicatorColor': 'warn',
    'error.backgroundColor': 'dangerSoft', 'error.borderColor': 'danger', 'error.indicatorColor': 'danger',
    'pending.indicatorColor': 'muted',
})

# Follow the visitor's system light/dark preference, like the web app does.
put('categories.global.colorSchemeMode', 'DYNAMIC')
put('categories.global.pageHeader.enabled', False)
put('categories.global.pageFooter.enabled', False)
# Cognito's stock illustrations clash with the minimal style.
put('categories.form.displayGraphics', False)

(HERE / 'branding.json').write_text(json.dumps(s, indent=1) + '\n')
print('wrote branding.json')
