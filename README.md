# difero

A local browser UI for reviewing Git changes and collecting line comments.

![difero review interface][ui]

[ui]: https://raw.githubusercontent.com/VitaliyR/difero/main/docs/screenshot.png

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

Run it from a folder that is not a repository itself but holds several, such as
`theapp/` with `app/`, `api/`, and `web/` inside, and the sidebar lists those
repositories. Pick one to review it as if difero had been started there. Each
repository keeps its own comments, and the number beside it is how many files it
has changed. Only direct subfolders are checked.

When developing this checkout:

```sh
pnpm install
pnpm run build
pnpm start
```

For frontend work, `pnpm dev` serves the UI through Vite with hot reload and
proxies `/api` to the difero server, which restarts on changes in `server/`
without reopening the browser. Pass a path to review another repo:
`pnpm dev ../other-repo`.

The CLI binds to port 4747 on `127.0.0.1` (or the next free port if 4747 is
taken), opens your browser, and stays running until Ctrl+C. A stable port keeps
review comments, which are saved in the browser, across runs. Use `--port <n>`
to pick a port (it fails if that port is taken) and `--no-open` if you want to
open the URL yourself.

Run `difero -h` or `difero --help` to see the available CLI options and version.

## Remote machines

difero only listens on `127.0.0.1`, so when it runs on a server or VPS, other
machines cannot reach it directly. There are two ways to open it in the browser
on your own machine: publish it to your tailnet with Tailscale, or forward its
port over SSH.

When difero runs over SSH, it does not try to open a browser on the server. It
prints the commands for both options instead, filled in with the port it
actually uses:

```
difero v1.1.0  /home/alice/projects/my-app
               http://127.0.0.1:4747/
               Press Ctrl+C to stop.
               Over SSH? Publish it to your tailnet with Tailscale:
                 tailscale serve --bg --https=4747 http://127.0.0.1:4747
               Or forward the port from your machine and open the URL there:
                 ssh -L 4747:127.0.0.1:4747 <host>
```

The Tailscale line only shows when the `tailscale` command is installed on the
server.

### With Tailscale

If the server and your devices are on the same tailnet, let Tailscale publish
difero. On the server, run this once:

```sh
tailscale serve --bg --https=4747 http://127.0.0.1:4747
```

Say the server's Tailscale name is `dev` and your tailnet is
`example-tailnet.ts.net`. Open `https://dev.example-tailnet.ts.net:4747/` from
your laptop or phone. Run `tailscale serve status` to see the exact URL.

- **One-time setup.** `--bg` keeps the mapping across reboots and new sessions.
  Start difero whenever you need it and reload the page.
- **No SSH session needed.** The page works as long as difero is running on the
  server, for example inside tmux.
- **Only your tailnet.** The page is never on the public internet. difero has no
  login, though, so anyone on your tailnet who can reach the server can read
  your diffs.
- **One mapping per port.** If difero moves to 4748 because 4747 is taken, that
  port needs its own `tailscale serve` line. Give each repo a fixed port with
  `--port` and a mapping for each.
- **First run.** Tailscale may ask you to enable HTTPS certificates for your
  tailnet. On Linux, run the command with `sudo` unless you have set yourself as
  operator with `sudo tailscale set --operator=$USER`.
- **Removing it.** Run `tailscale serve --https=4747 off`.

### With SSH port forwarding

Say your server is `dev.example.com` and you log in as `alice`. On your own
machine, connect with the port forwarded:

```sh
ssh -L 4747:127.0.0.1:4747 alice@dev.example.com
```

Then, in that SSH session:

```sh
cd ~/projects/my-app
npx difero
```

Open `http://127.0.0.1:4747/` in your local browser. Most terminals let you
Cmd-click or Ctrl-click the URL.

To skip `-L` every time, add the forward to `~/.ssh/config` on your own machine:

```
Host dev
  HostName dev.example.com
  User alice
  LocalForward 4747 127.0.0.1:4747
```

Now `ssh dev` forwards the port on every connection.

A few things to keep in mind:

- **Port in use on the server.** If 4747 is taken there, difero picks the next
  free port, such as 4748, and the printed command shows it. Forward that port
  instead, or run `npx difero --port 4747` so it fails rather than moving.
- **Port in use on your machine.** If a local difero already uses 4747, forward
  to another local port, such as
  `ssh -L 5747:127.0.0.1:4747 alice@dev.example.com`, and open
  `http://127.0.0.1:5747/`.
- **Adding a forward to an open session.** Press Enter, type `~C`, and enter
  `-L 4747:127.0.0.1:4747`.
- **Saved comments.** The browser stores comments per address, so use the same
  local port each time and `127.0.0.1` rather than `localhost`.
- **VS Code Remote-SSH and Cursor.** Their terminals forward ports on their own
  and set `BROWSER`, which difero uses to open the page in your local browser.
  No `-L` is needed.

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
| `C`     | Copy and clear comments                                     |
| `Alt+C` | Copy comments without clearing                              |
| `Shift` | With `C`/`Alt+C`, only the current repository (multi-repo)  |
| `?`     | Show all shortcuts                                          |

Base suggests the remote default branch, then `main` or `master`. Select another
branch from the menu when working on a branch based on a feature branch. Git
does not record a branch's original parent, so the selected branch is the source
of truth for this comparison.

Click the `+` beside a diff line or its line number to comment on either side.
Save with `⌘/Ctrl+Enter`. Use the pencil button to edit a comment.

**Copy & clear comments** copies lines in `path:line comment` format and clears
the review; old-side comments include `(old)` after the line number. Hold
**Alt** to copy without clearing; the `C` shortcut follows the same rule. The
confirmation toast offers **Undo** to bring cleared comments back. Comments are
stored locally in your browser for each repository until cleared.

In a folder of repositories, comments stay with their repository when you
switch, and copying includes every repository's comments, each group under its
folder name (`repo/` followed by its `path:line comment` lines). Hold **Shift**
to copy only the current repository. The button label follows the held modifiers
so it always shows what a click does.

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
