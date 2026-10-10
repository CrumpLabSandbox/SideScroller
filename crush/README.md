# Crush Commando (guest game)

A copy of **Crush Commando** by Sam Ling, from https://github.com/samuelling/crush-commando
(commit 743ad1f). It is the upstream's built `index.html`, unmodified.

Hollow Dash links to it through a door in Chapter Two (Stoop Ball). The door opens this page in a
full-screen frame with a button to come back; nothing in this folder knows about Hollow Dash.

To update it, rebuild upstream (`tools/build.sh`) and copy its `index.html` over this one.
