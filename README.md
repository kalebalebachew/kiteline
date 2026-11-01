<div align="center">
  <img src="apps/web/public/logo.svg" width="88" alt="" />
  <h1>Kiteline</h1>
  <p><strong>Your terminal, in your pocket.</strong><br />Drive Claude Code on your computer from your phone.</p>
  <p><a href="https://kiteline.seefun.dev/">Website</a> · <a href="https://kiteline.seefun.dev/docs/">Docs</a> · <a href="#quick-start">Quick start</a></p>
</div>

<p align="center">
  <img src="docs/kiteline-demo.webp" width="880" alt="On the phone, Claude Code reads and searches the project, edits src/auth.ts, and runs the tests on its own in Auto mode; the line changes in the editor on the computer as the edit lands, and the reply arrives on the phone." />
</p>

Kiteline runs Claude Code on your computer and puts every session on your phone. Pick up where you left off, start something new, and approve what it does from wherever you are.

It's self-hosted: your phone talks straight to your computer, and Claude Code keeps running there with your files, your settings and your login.

## What you can do

- **Every session, one list.** The ones you start from your phone and the ones you run in a terminal.
- **Pick up where you left off,** or start a new session in any project.
- **Watch it work.** Replies stream in, with every command and edit laid out step by step.
- **Approve from anywhere.** Allow, deny with a note, or always allow, right from your phone.
- **Your modes, your models.** Change how much it asks, and which model it uses, mid-session.
- **Feels like an app.** Add it to your home screen, in light or dark.

## Quick start

You need Node.js 22.18 or newer, pnpm, and Claude Code signed in on the computer.

```bash
git clone https://github.com/sifenfisaha/kiteline.git && cd kiteline
pnpm install
pnpm build
pnpm start
```

Scan the QR code it prints with your phone's camera, and you're in.

Everything else is in the **[docs](https://kiteline.seefun.dev/docs/)**:

- [Reach it from anywhere](https://kiteline.seefun.dev/docs/#anywhere), with Tailscale
- [Keep it running](https://kiteline.seefun.dev/docs/#always-on) all the time, even with the lid closed
- [Approvals](https://kiteline.seefun.dev/docs/#approve) and [permission modes](https://kiteline.seefun.dev/docs/#modes)
- [Configuration](https://kiteline.seefun.dev/docs/#config), [security](https://kiteline.seefun.dev/docs/#security) and [troubleshooting](https://kiteline.seefun.dev/docs/#troubleshooting)

## Good to know

- **Treat the pairing link like a password.** Anyone who opens it can drive Claude Code on your computer. Don't open Kiteline's port to the internet; use Tailscale to reach it from elsewhere.
- **It uses Claude Code's own login,** your Claude plan or API key. Check that the way you use it fits your plan's terms.
- **Tested on Linux so far.** Reports from real phones, macOS and Windows are very welcome.

## Contributing

```bash
pnpm dev     # the server, the app and the website, reloading as you edit
pnpm check   # lint and format
```

Issues and pull requests are welcome.

## Credits

Built on [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), with [Phosphor](https://phosphoricons.com) icons and [Inter](https://rsms.me/inter/). The demo is made with [Stageshow](https://benji.org/stageshow). The website's sky is a photo by [Nothing Ahead](https://www.pexels.com/@ian-panelo/) on [Pexels](https://www.pexels.com/photo/clouds-in-the-sky-8726326/), used under the [Pexels license](https://www.pexels.com/license/) rather than this project's MIT license.

Kiteline is an independent project, not made by or affiliated with Anthropic. [MIT](LICENSE) licensed.
