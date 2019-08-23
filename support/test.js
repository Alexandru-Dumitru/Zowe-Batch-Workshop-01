var assert = require('assert');
var cmd = require('node-cmd');
var log = require('fancy-log');
/**
 * Callback equivalent to that of node-cmd
 * @callback nodeCmdCallback
 * @param {Error} err
 * @param {string} data
 * @param {string} stdErr
 */

/**
 * await Job Callback
 * @callback awaitJobCallback
 * @param {Error} err
 */

/**
 * Retrieve Marble Quantity Callback
 * @callback awaitQuantityCallback
 * @param {Error}  err
 * @param {number} quantity null if marble is not defined in inventory
 */

/**
* Polls jobId. Callback is made without error if Job completes with CC 0000 in the allotted time
* @param {string}           jobId     jobId to check the completion of
* @param {awaitJobCallback} callback  function to call after completion
* @param {number}           tries     max attempts to check the completion of the job
* @param {number}           wait      wait time in ms between each check
*/
function awaitJobCompletion(jobId, callback, tries = 30, wait = 1000) {
  if (tries > 0) {
      sleep(wait);
      cmd.get(
      'bright jobs view job-status-by-jobid ' + jobId + ' --rff retcode --rft string',
      function (err, data, stderr) {
          retcode = data.trim();
          if ((retcode == "CC 0000" ) || (retcode == "CC 0004")) {
            callback(null);
          } else if (retcode == "null") {
            awaitJobCompletion(jobId, callback, tries - 1, wait);
          } else {
            callback(new Error(jobId + " had a return code of " + retcode));
          }
      }
      );
  } else {
      callback(new Error(jobId + " timed out."));
  }
}

/**
* Creates a Marble with an initial quantity
* @param {string}           color        color of Marble to create
* @param {number}           [quantity=1] quantity of Marbles to initially create
* @param {nodeCmdCallback}  [callback]   function to call after completion, callback(err, data, stderr)
*/
function createMarble(color, quantity=1, cost=1, callback) {    //MOD: Added cost
  var db2 = (typeof process.env.DB2 === "undefined") ? "" : process.env.DB2,
      command = 'zowe db2 execute sql -q "insert into EVENT.MARBLE (COLOR, INVENTORY, COST) VALUES (\'' + color + '\', \''+ quantity +'\', \'' + cost + '\')"' + db2;  //MOD: added quantity and cost

  cmd.get(command, function (err, data, stderr) {
      typeof callback === 'function' && callback(err, data, stderr);
    }
  );
}

/**
* Deletes a Marble with an initial quantity
* @param {string}           color       color of Marble to delete
* @param {nodeCmdCallback}  [callback]  function to call after completion, callback(err, data, stderr)
*/
function deleteMarble(color, callback) {
  var db2 = (typeof process.env.DB2 === "undefined") ? "" : process.env.DB2,
      command = 'zowe db2 execute sql -q "delete from EVENT.MARBLE where COLOR = \'' + color + '\'"' + db2;

  cmd.get(command, function (err, data, stderr) {
      typeof callback === 'function' && callback(err, data, stderr);
    }
  );
}

/**
* Gets quantity of Marble from inventory
* @param {string}                 color     color of Marble to retrieve quantity of
* @param {awaitQuantityCallback}  callback  function to call after completion
*
*/
function getMarbleQuantityJCL(color, callback) {
  // Submit job, await completion
  var zosmf = (typeof process.env.ZOSMF === "undefined") ? "" : process.env.ZOSMF,
      command = 'zowe zos-jobs submit data-set "CUST001.BRIGHT.MARBLES.JCL(MBBLMN01)" --rff jobid --rft string ' + zosmf;

  cmd.get(command, function (err, data, stderr) {
          if(err){
        callback(err);
      } else {
        // Strip unwanted whitespace/newline
        var jobId = data.trim();

        // Await the jobs completion
        awaitJobCompletion(jobId, function(err){
          if(err){
            callback(err);
          } else {
            cmd.get(
              'bright jobs view sfbi ' + jobId + ' 118 ',
              function (err, data, stderr) {
                if(err){
                  callback(err);
                } else {
                  var pattern = new RegExp(color + ".*[0-9][0-9][0-9][0-9].*[0-9][0-9][0-9][0-9].*","g");
                  var found = data.match(pattern);
                  if(!found){
                    callback(err, null);
                  } else { //found
                    //found should look like nn_| COLOR      QUANTITY      COST
                    var row = found[0].split(/\s+/);
                    var quantity = Number(row[2]);
                    var cost = Number(row[1]);
                    callback(err, quantity, cost);
                  }
                }
              }
            );
          }
        });
      }
    }
  );
}


/**
* Gets quantity of Marble from inventory
* @param {string}                 color     color of Marble to retrieve quantity of
* @param {awaitQuantityCallback}  callback  function to call after completion
*
*/
function getMarbleQuantityStoredProcedure(color, callback) {
  // Submit job, await completion
  var db2 = (typeof process.env.DB2 === "undefined") ? "" : process.env.DB2,
      command = 'zowe db2 call sp "EVENT.MBSTOR01(\''+ color + '\',?,?)" --parameters 0 0' + db2;


  cmd.get(command, function (err, data, stderr) {
          if(err){
        callback(err);
      } else {
        var pattern = new RegExp("\-*.[0..9]","g")
        var found = data.match(pattern);
        if(!found) {
          callback(new Error("Marble not found in database"));
        } else {
          var row1 = found[0].split(/\s+/);
          //var quantity = Number(row1[1]);
          callback(err, 1);

        }
      }
    }
  );
}


/**
* Gets quantity of Marble from inventory
* @param {string}                 color     color of Marble to retrieve quantity of
* @param {awaitQuantityCallback}  callback  function to call after completion
*
*/
function getMarbleQuantity(color, callback) {
  // Submit job, await completion
  var zosmf = (typeof process.env.ZOSMF === "undefined") ? "" : process.env.ZOSMF,
      command = 'zowe zos-jobs submit data-set "CUST001.MARBLES.JCL(MARBDB2)" --rff jobid --rft string ' + zosmf;

      cmd.get(command, function (err, data, stderr) {
      if(err){
        callback(err);
      } else {
        // Strip unwanted whitespace/newline
        var jobId = data.trim();

        // Await the jobs completion
        awaitJobCompletion(jobId, function(err){
          if(err){
            callback(err);
          } else {
            cmd.get(
              'bright jobs view sfbi ' + jobId + ' 104 ',
              function (err, data, stderr) {
                if(err){
                  callback(err);
                } else {
                  var pattern = new RegExp(".*\\| " + color + " .*\\|.*\\|.*\\|","g");
                  var found = data.match(pattern);
                  if(!found){
                    callback(err, null);
                  } else { //found
                    //found should look like nn_| COLOR       |       QUANTITY |        COST |
                    var row = found[0].split("|");
                    var quantity = Number(row[2]);
                    var cost = Number(row[3]);                                //MOD: Updated Cost
                    callback(err, quantity, cost);                            //MOD: Updated Cost
                  }
                }
              }
            );
          }
        });
      }
    }
  );
}

/**
* Updates a Marble with an initial quantity
* @param {string}           color       color of Marble to update
* @param {number}           quantity    quantity of Marbles desired
* @param {nodeCmdCallback}  [callback]  function to call after completion,callback(err, data, stderr)
*/
function updateMarble(color, quantity, callback) {
  var db2 = (typeof process.env.DB2 === "undefined") ? "" : process.env.DB2,
      command = "zowe db2 execute sql -q \"update EVENT.MARBLE set INVENTORY = " + quantity + " where color = '" + color + "'\"" + db2;

  cmd.get(command, function (err, data, stderr) {
      typeof callback === 'function' && callback(err, data, stderr);
    }
  );
}

/**
 * Sleep function.
 * @param {number} ms Number of ms to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Marbles', function () {
  // Change timeout to 60s from the default of 2s
  this.timeout(60000);

  /**
   * Test Plan
   * Delete the marble to reset inventory to zero (Delete will be tested later)
   *
   * Set the Marble Quantity to 1
   * Verify that there is one marble in the inventory
   *
   * Verify Marble using COBOL Code
   * Uses COBOL code to verify the marbles in inventory
   *
   * Verify Marble using Stored Procedure
   * Uses Stored Procedure code to verify the marbles in inventory
   *
   * Add marble using SQL
   * Adds marble to inventory and verifies update
   *
   * Delete marble from inventory
   * Delete Marble and ensure it is deleted
   *
   * Update marble (which doesn't exist)
   * Verify approrpiate error message is returned
   */
  describe('Inventory Manipulation', function () {
    const COLOR = "WHITE";

    // Delete the marble to reset inventory to zero (Delete will be tested later)
    before(function(done){
      deleteMarble(COLOR, function(){
        done();
      })
    });


    it('should create a single marble with a cost of 1', function (done) {    //MOD: Change Title
      // Create marble
      createMarble(COLOR, 1, 1,function(err, data, stderr){                   //MOD: Added reference to cost
        // Strip unwanted whitespace/newline
        data = data.trim();
        assert.equal(data, "Result #1\n(empty array)", "Unsuccessful marble creation");

        getMarbleQuantity(COLOR, function(err, quantity, cost){               //MOD: Added reference to cost
          if(err){
            throw err;
          }
          assert.equal(quantity, 1, "Inventory is not as expected");
          assert.equal(cost, 1, "Cost is not as expected");                   //MOD: Added reference to cost
          done();
        });
      });
    });

    it('should verify the marble using COBOL Execution code', function (done) {
      //Get Marble Quantity and Verify One Marble
      getMarbleQuantityJCL(COLOR, function(err, quantity, cost) {
        if(err) {
          throw err;
        }
        assert.equal(quantity, 1, "Inventory count is not as expected");
        assert.equal(cost, 1, "Cost is not as expected.")
        done();
      });
    });

    it('should verify the marble using Stored Procedure code', function (done) {
      //Get Marble Quantity and Verify One Marble
      getMarbleQuantityStoredProcedure(COLOR, function(err, quantity) {
        if(err) {
          throw err;
        }
        assert.equal(quantity, 1, "Inventory count is not as expected");
        //assert.equal(cost, 1, "Cost is not as expected.")
        done();
      });
    });

    it('should update marble inventory', function (done) {
      // Update marble
      updateMarble(COLOR, 2, function(err, data, stderr){
        // Strip unwanted whitespace/newline
        data = data.trim();
        assert.equal(data, "Result #1\n(empty array)", "Unsuccessful marble update");

        // Marble inventory should be updated
        getMarbleQuantity(COLOR, function(err, quantity){
          if(err){
            throw err;
          }
          assert.equal(quantity, 2, "Inventory is not as expected");
          done();
        });
      });
    });

    it('should delete the marble color from inventory', function (done) {
      // Delete marble
      deleteMarble(COLOR, function(err, data, stderr){
        // Strip unwanted whitespace/newline
        data = data.trim();
        assert.equal(data, "Result #1\n(empty array)", "Unsuccessful marble deletion");

        //Marble should be removed from inventory
        getMarbleQuantity(COLOR, function(err, quantity){
          if(err){
            throw err;
          }
          assert.equal(quantity, null, "Inventory is not as expected");
          done();
        });
      });
    });

    it('should not update marble inventory for a marble color that does not exist', function (done) {
      // Update marble
      updateMarble(COLOR, 3, function(err, data, stderr){
        // Strip unwanted whitespace/newline
        data = data.trim();
        assert.equal(data, "Result #1\n(empty array)", "Unexpected marble update or incorrect error message");

        // Marble inventory should be updated
        getMarbleQuantity(COLOR, function(err, quantity){
          if(err){
            throw err;
          }
          assert.equal(quantity, null, "Inventory is not as expected");
          done();
        });
      });
    });
  /**
   * Test Plan Complete
   *
   * Clean up the database and leave a marble in database.
  */
    after(function(done) {
      createMarble(COLOR, 1, 1, function(){                                 //MOD: Added reference to cost
        done();
      })
    });
    //END OF TESTS
  });
});