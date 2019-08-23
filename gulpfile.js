var gulp = require('gulp-help')(require('gulp'));
var gulpSequence = require('gulp-sequence');
var PluginError = require('plugin-error');
var scan = require('gulp-scan');
var cmd = require('node-cmd');

/**
 * await Job Callback
 * @callback awaitJobCallback
 * @param {Error} err
 */

/**
* Polls jobId. Callback is made without error if Job completes with CC < MaxRC in the allotted time
* @param {string}           jobId     jobId to check the completion of
* @param {number}           [maxRC=0] maximum allowable return code
* @param {awaitJobCallback} callback  function to call after completion
* @param {number}           tries     max attempts to check the completion of the job
* @param {number}           wait      wait time in ms between each check
*/
function awaitJobCompletion(jobId, maxRC=0, callback, tries = 30, wait = 1000) {
  if (tries > 0) {
      sleep(wait);
      cmd.get(
      'zowe jobs view job-status-by-jobid ' + jobId + ' --rff retcode --rft string',
      function (err, data, stderr) {
          retcode = data.trim();
          //retcode should either be null of in the form CC nnnn where nnnn is the return code
          if (retcode == "null") {
            awaitJobCompletion(jobId, maxRC, callback, tries - 1, wait);
          } else if (retcode.split(" ")[1] <= maxRC) {
            callback(null);
          } else {
            callback(new Error(jobId + " had a return code of " + retcode + " exceeding maximum allowable return code of " + maxRC));
          }
      }
      );
  } else {
      callback(new Error(jobId + " timed out."));
  }
}

/**
 * Sleep function.
 * @param {number} ms Number of ms to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

gulp.task('check-stored-procedure', 'Check Stored Procedure', function (callback) {
  var db2 = (typeof process.env.DB2 === "undefined") ? "" : process.env.DB2,
      command = 'zowe db2 call sp "EVENT.MBSTOR01(\'WHITE\',?)" --parameters 0 ' + db2;

  cmd.get(command, function (err, data, stderr) {
    if(err){
      callback(err);
    } else if (stderr){
      callback(new Error("\nCommand:\n" + command + "\n" + stderr + "Stack Trace:"));
    } else {
      var pattern = new RegExp(".*empty array.*","g");
      var found = data.match(pattern);
      if (!found) {
        callback();
      } else {
        callback(new Error("Found Empty Array."));
      }
  }});
});

gulp.task('verify-dataset-exists', 'Verify Dataset Exists', function (callback) {
  var zosmf = (typeof process.env.ZOSMF === "undefined") ? "" : process.env.ZOSMF,
      command = 'zowe files list ds CUST001.BRIGHT.MARBLES.JCL' + zosmf;

  cmd.get(command, function (err, data, stderr) {
    if(err){
      callback(err);
    } else if (stderr){
      callback(new Error("\nCommand:\n" + command + "\n" + stderr + "Stack Trace:"));
    } else {
      var pattern = new RegExp(".*BRIGHT.MARBLES.JCL.*","g");
      var found = data.match(pattern);
      if (!found) {
        callback(new Error("Could not find dataset."));
      } else {
        callback();
      }
  }});
});
