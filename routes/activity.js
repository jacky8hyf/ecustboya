var router = require('express').Router();
var AV = require('leanengine');
var utils = require('../lib/utils');
var models = require('../models');
var Activity = models.Activity,
    Participant = models.Participant;
// 路由

router.param('activityId', function (req, res, next, activityId) {
  AV.queryObject(Activity, activityId).toPromise().then(function(activity) {
    req.activity = activity;
    next();
  }, function(error) {
    error.status=404;
    next(error);
  });
})

router.route('/:activityId')
.all(function(req, res, next) {
  next();
})
.get(function(req, res, next) {
  res.render('activity', { activityName:req.activity.name(), errorMsg: "null" });
})
.post(function(req, res, next) {
  res.send(req.body);
})

module.exports = router;
