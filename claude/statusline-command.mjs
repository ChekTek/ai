import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { workspace, model, effort } = JSON.parse(readFileSync(0, 'utf8'));
const output = [`\x1b[1m${model?.display_name ?? model?.id ?? ''}\x1b[0m`];

if (effort?.level) output.push(`\x1b[2m(${effort.level})\x1b[0m`);

const gitPart = gitStatus(workspace?.current_dir);
if (gitPart) output.push('\x1b[2m|\x1b[0m', gitPart);

process.stdout.write(output.join(' '));

function gitStatus(cwd) {
  if (!cwd) return '';

  let status;
  try {
    status = execFileSync('git', [
      '--no-optional-locks', '-C', cwd,
      'status', '--porcelain=v2', '--branch', '--untracked-files=normal',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }

  const lines = status.trimEnd().split('\n');
  const prefix = '# branch.head ';
  const head = lines.find((line) => line.startsWith(prefix))?.slice(prefix.length);
  if (!head) return '';

  const branch = head === '(detached)' ? 'HEAD' : head;
  const dirty = lines.some((line) => !line.startsWith('# '));
  const marker = dirty ? '\x1b[33m*\x1b[0m' : '';
  return `\x1b[36m${branch}\x1b[0m${marker}`;
}
