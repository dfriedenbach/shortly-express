var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var morgan = require('morgan');
var bodyParser = require('body-parser');
var session = require('express-session');
var bcrypt = require('bcrypt-nodejs');
var passport = require('passport');
var GitHubStrategy = require('passport-github2').Strategy;

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var github = require('./githubConfig');

// Passport config for github OAuth
passport.serializeUser(function(user, done) {
  console.log('Serialized', user.id);
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  console.log('Deserialized');
  new User({id: id}).fetch().then(function(user){
    done(null, user);
  });
});

console.log(github.clientID);

passport.use(new GitHubStrategy({
    clientID: github.clientID,
    clientSecret: github.clientSecret,
    callbackURL: "http://127.0.0.1:4568/login/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    console.log('Profile fetched.');
    new User({ githubID: profile.id }).fetch().then(function(user){
      if (user) {
        done(null, user);
      } else {
        new User({githubID: profile.id}).save().then(function(user){
          done(null,user);
        });
      }
    });
  }
));




var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
app.use(morgan());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
//Use express-sessions
app.use(session({
  secret: 'Dont tell anyone',
  resave: true
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(__dirname + '/public'));

var checkUser = function(req, res, next){
  if (req.user) {
    next();
  } else {
    res.redirect('/login');
  }
}

app.get('/', checkUser,
function(req, res) {
  res.render('index');
});

app.get('/create', checkUser,
function(req, res) {
  res.render('index');
});

app.get('/links', checkUser,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

app.post('/links', 
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/
app.get('/login', passport.authenticate('github', { scope: [ 'user:email' ] }));

app.get('/login/callback', passport.authenticate('github', {
  successRedirect: '/',
  failureRedirect: '/login'
}));

// app.post('/login', function(req, res) {
//   new User({username: req.body.username})
//   .fetch().then(function(user){
//     if (user) {
//       bcrypt.compare(req.body.password, user.get('passwordHash'), function(err, result) {
//         if (result) {
//           req.session.user = req.body.username;
//           res.redirect('/');
//         } else {
//           res.redirect('/login');
//         }
//       });
//     } else {
//       res.redirect('/login');
//     }
//   })
// });

app.get('/signup', function(req, res) {
  res.redirect('/login');
});

// app.post('/signup', function(req, res) {
//   new User({username: req.body.username})
//   .fetch().then(function(user){
//     if (user) {
//       res.redirect('/login');
//     } else {
//       bcrypt.hash(req.body.password, null, null, function(err, hash){
//         new User({
//           username: req.body.username,
//           passwordHash: hash
//         }).save().then(function() {
//           req.session.user = req.body.username;
//           res.redirect('/');
//         });
//       });
//     }
//   });
// });

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/login');
});


/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
