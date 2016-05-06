var Git = require("nodegit");
var dir = require('node-dir');

var repoUrl = "git@github.com:pivotal-cf-experimental/london-services-locks.git";
var environmentState = [];

var getMostRecentCommit = function(repository) {
  console.log("Getting commit")
  return repository.getBranchCommit("master");
};

var getCommitMessage = function(commit) {
  return commit.message();
};

var printCommitMessage = function() {
  Git.Repository.open("repo")
    .then(getMostRecentCommit)
    .then(getCommitMessage)
    .then(function(message) {
      console.log(message);
    });
}

var pullGitRepo = function(repository) {
  return repository.mergeBranches("master", "origin/master");
}

function filterFileNames(filename) {
  if ( filename.match(/claimed/) && !filename.match(/pipeline$/) && !filename.match(/gitkeep/) && !filename.match(/bosh-director/) ) {
    return true
  }
  else {
    return false
  }
}

var getCommitMetadata = function(repo, filePath) {
  return new Promise(function(resolve, reject) {
    var latestCommit;
    var revwalk = repo.createRevWalk();
    revwalk.pushHead();
    revwalk.sorting(Git.Revwalk.SORT.Reverse);
    return revwalk.fileHistoryWalk(filePath, 999999).then(function(arrayHistoryEntry) {
      latestCommit = arrayHistoryEntry[0].commit;
    }).then(function() {
      resolve(latestCommit);
    });
  })
}

var getLockState = function(lockFileName) {
  return new Promise(function(resolve, reject) {
    var lockState = {}
    lockFileName = lockFileName.replace("repo/", "");
    // console.log(lockFileNames[i]);
    lockState.name = lockFileName.split('/').pop();
    lockState.isClaimed = lockFileName.indexOf("unclaimed") == -1
    lockState.isPipeline = true
    Git.Repository.open("repo").then(function(repo) {
      return getCommitMetadata(repo, lockFileName);
    }).then(function(commit) {
      lockState.message = commit.message().split("\n").shift();
      lockState.timestamp = commit.time();
      lockState.committer = commit.author().name();
      resolve(lockState);
    });
  });
}

var getEnvironmentState = function(lockFileNames) {
  return new Promise(function(resolve, reject) {
    var promises = [];

    for (i = 0; i < lockFileNames.length; i++) {
      promises.push(getLockState(lockFileNames[i]))
    }

    Promise.all(promises).then(function(envState) {
      resolve(envState);
    })
  })
}

var cloneOptions = {};
cloneOptions.fetchOpts = {
  callbacks: {
    certificateCheck: function() { return 1; },
    credentials: function(url, userName) {
      console.log("Creds func called with %s@%s", userName, url);
      return Git.Cred.sshKeyFromAgent(userName);
    }
  }
}

var getLocks = function() {
  return new Promise(function(resolve, reject) {
    dir.paths("repo/", function(err, paths) {
      var fileNames = paths.files;
      var lockFileNames = fileNames.filter(filterFileNames);

      getEnvironmentState(lockFileNames).then(function(envState) { resolve(envState); });
    })
  })
}

var lockState = function() {
  return new Promise(function(resolve, reject) {
    Git.Repository.open("repo").then(function(repository) {
      pullGitRepo(repository).then(getLocks).then(function(locks) { resolve(locks); });
    }, function(reason) {
      Git.Clone(repoUrl, "repo", cloneOptions).then(getLocks, function(reason) {
        console.err("Failed to clone repo: %s", reason);
      });
    })
  });
}

module.exports = lockState;
