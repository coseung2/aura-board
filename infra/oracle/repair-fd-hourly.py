"""Change only the maturity sweep; preserve every other cron entry."""
from pathlib import Path

path = Path('/etc/cron.d/aura-board-app')
text = path.read_text()
lines = text.splitlines(keepends=True)
matches = [i for i, line in enumerate(lines) if not line.lstrip().startswith('#') and 'run-app-cron.sh fd-maturity GET' in line]
if len(matches) != 1:
    raise SystemExit('Expected exactly one maturity schedule')
index = matches[0]
parts = lines[index].split()
if parts[5:] != ['aura-app', '/opt/aura-board-app/bin/run-app-cron.sh', 'fd-maturity', 'GET']:
    raise SystemExit('Unexpected maturity command')
lines[index] = '0 * * * * ' + ' '.join(parts[5:]) + '\n'
path.write_text(''.join(lines))
print(lines[index].strip())
