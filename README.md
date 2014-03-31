Pandemic [![Build Status](https://travis-ci.org/JBKahn/pandemic.svg?branch=master)](https://travis-ci.org/JBKahn/pandemic)
========

Implementation of the [Pandemic][1] cooperative board game in [node.js][2] and
[AngularJS][3]. The point was mainly to learn more about Angular, but so far
the server side has received more attention, and the UI is more of a barely
functional stub.

There is also a [Perl implementation of Pandemic][4] that appears to be more
feature complete.

[1]: http://en.wikipedia.org/wiki/Pandemic_%28board_game%29
[2]: http://nodejs.org/
[3]: http://angularjs.org/
[4]: https://github.com/jquelin/games-pandemic/

License
-------

This implementation of Pandemic is copyright 2013-2014 by Gert van Valkenhoef.
It is free software under the GNU GPL v3. See [LICENSE.txt](LICENSE.txt) for
more information.

Build
-----

    sudo apt-get install nodejs npm
    sudo ln -s /usr/bin/nodejs /usr/local/bin/node # for bower
    sudo npm install -g bower
    bower install
    npm install

Run
---

    node server

Point your browser at http://localhost:8080 -- note that you need two players
to create a game.

Tests
-----

Run tests using:

    jasmine-node spec

Make sure you have jasmine-node installed:

	sudo npm install -g jasmine-node

Tests are also run on TravisCI

TODO
----

Gameplay features:

 - special events
   [x] resilient population
   [x] government grant
   [x] one quiet night
   [x] airlift
   [ ] forecast
 - share knowledge UI
 - make ui-sortable work on touch devices; http://touchpunch.furf.com/
 - keep private information private (e.g. hand cards)
 - more input sanitation (e.g. location / player IDs in action)
 - move research centers when they run out
 - ensure *nothing* else can happen during approval phase
 - give reasons for action rejection
 - display of raw IDs / JSON / etc. must be eliminated

Other features:

 - the UI needs a LOT of work
 - also display names of offline players that have a role in game
 - display more information about ongoing games (status, active players)
 - live update list of ongoing games
 - remove stale games after a time-out
 - close websockets after a time-out, with dynamic re-opening as needed
 - for ended games, serve the state over plain HTTP instead

Refactoring:

 - Refactor the horrible Game.act() blob and simplify tests
 - Factor out action preconditions so they can also be calculated client side
 - The map SVG is very unreadable, use more directives for it
 - Split the client side up into require.js modules
