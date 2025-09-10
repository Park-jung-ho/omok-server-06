var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

// DB 설정
var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;

// Session 설정
var session = require('express-session');
var fileStore = require('session-file-store')(session);

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

// 세션 설정
app.use(session({
  secret: process.env.SESSION_SECRET || 'session-login',
  resave: false,
  saveUninitialized: false,  // 세션이 필요할 때만 저장하도록 설정
  store: new fileStore({
    path: './sessions', // 세션 파일 저장 경로 지정
    ttl: 24 * 60 * 60, // 세션 유효 기간 (1일)
    reapInterval: 60 * 60 // 세션 정리 주기 (1시간)
  }),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS 환경에서만 쿠키 전송
    maxAge: 24 * 60 * 60 * 1000 // 쿠키 유효 기간 (1일)
  }
}));

// DB 연결
async function connectDB() {
  var databaseUrl = 'mongodb://localhost:27017';

  try {
    const database = await MongoClient.connect(databaseUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Database connected successfully');
    app.set('database', database.db('omok-06'));

    // 연결 종료 처리
    process.on('SIGINT', async () => {
      await database.close();
      console.log('Database connection closed');
      process.exit(0);
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

connectDB().catch(err => {
  console.error('Failed to connect to the database:', err);
  process.exit(1);
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;