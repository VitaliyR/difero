# difero

A local browser UI for reviewing Git changes and collecting line comments.

![difero review interface][ui]

[ui]: https://raw.githubusercontent.com/VitaliyR/difero/main/docs/screenshot.jpg

## Why another tool?

Other diff viewers I tried did not support this review workflow, and the changes
I proposed were outside their design goals.

When working with an agent, I review its changes, collect comments, and stage
the files before asking for fixes. Then I review only the new, unstaged fixes
instead of rereading the whole diff.

## Usage

From any directory in a Git repository:

```sh
npx difero
# or: pnpm dlx difero
```

When developing this checkout:

```sh
pnpm install
pnpm run build
pnpm start
```

The CLI binds to a free port on `127.0.0.1`, opens your browser, and stays
running until Ctrl+C. Use `--no-open` if you want to open the URL yourself.

Run `difero -h` or `difero --help` to see the available CLI options and version.

## Review workflow

| Key     | View                                                        |
| ------- | ----------------------------------------------------------- |
| `1`     | Working: `HEAD` to working tree, including untracked files  |
| `2`     | Staged: `HEAD` to index                                     |
| `3`     | Unstaged: index to working tree, including untracked files  |
| `4`     | Base: merge base to working tree, including untracked files |
| `R`     | Reload changes                                              |
| `J`     | Go to next file                                             |
| `K`     | Go to previous file                                         |
| `C`     | Copy comments without clearing                              |
| `Alt+C` | Copy and clear comments                                     |
| `?`     | Show all shortcuts                                          |

Base suggests the remote default branch, then `main` or `master`. Select another
branch from the menu when working on a branch based on a feature branch. Git
does not record a branch's original parent, so the selected branch is the source
of truth for this comparison.

Click the `+` beside a diff line or its line number to comment on either side.
Save with `⌘/Ctrl+Enter`. Use the pencil button to edit a comment.

**Copy & clear comments** copies lines in `path:line comment` format and clears
the review; old-side comments include `(old)` after the line number. Hold
**Alt** while clicking to copy without clearing. With the keyboard, `C` copies
and `Alt+C` copies and clears. Comments are stored locally in your browser for
this repository until cleared.

The sidebar groups files by folder and can be resized by dragging its right
edge. Click a file heading to collapse its diff; files over 500 lines start
collapsed.

Changed PNG, JPEG, GIF, WebP, AVIF, BMP, and ICO files show before and after
previews (up to 16 MB each). Other binary files and files over 2 MB have no text
preview. Git-detected renames show the old and new paths in one diff. An
untracked rename destination appears as a new file until it is staged.

## Development checks

Run `pnpm run check` for ESLint, Prettier, Git snapshot tests, and the
production build. Run `pnpm run format` to format the whole project.
`pnpm run test:browser` installs Playwright Chromium if needed and runs the
browser review flow.
