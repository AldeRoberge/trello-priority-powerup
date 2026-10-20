'use strict';
/* Starts the fake Trello on a fixed port to click around by hand:  npm run test:pw:serve */
const { startServer } = require('./server');

const port = Number(process.env.FAKE_TRELLO_PORT) || 4300;

startServer({ port }).then(
  (srv) => {
    console.log('Fake Trello is running (Ctrl+C to stop)');
    console.log('  Board (Power-Up buttons, card badges): ' + srv.url + '/__fake/board.html');
    console.log('  Every page of the Power-Up:            ' + srv.url + '/__fake/index.html');
    console.log('  Direct page, e.g.:                     ' + srv.url + '/table.html');
    console.log('  Dark mode: set theme in the board header, or POST /__fake/config {"theme":"dark"}');
  },
  (err) => {
    console.error('Could not start the fake Trello on port ' + port + ': ' + err.message);
    process.exit(1);
  }
);
