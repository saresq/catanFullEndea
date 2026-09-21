# catanFullEndea

## Dev server

Port 3000 belongs to the human's `npm run dev` (nodemon). Never start a server on it and never kill
whatever listens there (`lsof -ti:3000 | xargs kill` and the like): nodemon only restarts on a file
change, so a killed server stays down. Run your own servers on 3100+ and stop only the PIDs you
started.
