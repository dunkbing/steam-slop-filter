# Privacy Policy

Steam Slop Filter has no accounts, ads, analytics or tracking. It only runs on store.steampowered.com.

## What is sent to the server

- **Steam app IDs** of games shown on the page you're viewing, to look up their vote counts. These requests contain no identifier and nothing about them is stored per user.
- **Your votes**: the app ID, your vote, and a random anonymous ID generated when you install the extension. It isn't linked to your Steam account, name or email.

## What is stored

For each vote, the server keeps the app ID, vote, anonymous ID, time, and a salted one-way hash of your IP address. The hash is only used to limit how many votes one network can cast per game. Your IP address itself is never stored.

Your settings and your own votes are also kept in your browser's extension storage.

## Sharing

Data is never sold or shared. Only aggregate vote counts per game are public.

## Deleting your data

Clearing a vote deletes it from the server. Uninstalling the extension deletes your anonymous ID, so remaining votes can no longer be linked to you.

Questions: https://github.com/dunkbing/steam-slop-filter/issues
