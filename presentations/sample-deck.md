---
title: Welcome to Presentations
transition: slide
slideNumber: true
---

# Welcome to Presentations

A sample deck powered by reveal.js

<!-- notes: Welcome the audience. This deck demonstrates the markdown format. -->

---

## How it works

1. Create `.md` files in the `Presentations` folder
2. Separate slides with `---` on its own line
3. Open them in this app

Each slide is just markdown — rendered with GFM and line breaks.

<!-- notes: The format is intentionally simple. Anyone can edit these files. -->

----

## A vertical slide

This slide sits **below** “How it works.” Press **Down** to visit it, then **Up** to return to the main path.

<!-- notes: Use four dashes to create an optional detail or diagram slide beneath the preceding slide. -->

---

## Markdown features

- **Bold** and *italic* text
- `inline code` and code blocks
- [Links](https://revealjs.com)
- Lists (ordered and unordered)
- > Blockquotes for emphasis

---

## Code blocks

```python
def greet(name):
    return f"Hello, {name}!"

print(greet("world"))
```

Syntax highlighting is available when reveal.js plugins are loaded.

---

## Two-column layouts

You can use HTML directly in slides for richer layouts:

<div style="display: flex; gap: 40px;">
<div style="flex: 1;">

### Left column

- Point A
- Point B

</div>
<div style="flex: 1;">

### Right column

- Point C
- Point D

</div>
</div>

---

## Speaker notes

This slide has notes — press **N** or **S** to see them.

<!-- notes: Speaker notes are extracted from HTML comments. They show up in the speaker view alongside the current slide and a timer. -->

---

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| → / Space | Next slide |
| ← | Previous slide |
| F | Fullscreen |
| S | Speaker notes |
| O | Overview |
| Esc | Exit fullscreen / overview |

---

## That's it!

Create your own presentations in the `Presentations` folder.

Edit any `.md` file while a deck is open — it updates **live**.

<!-- notes: Thanks for watching. Questions? -->
