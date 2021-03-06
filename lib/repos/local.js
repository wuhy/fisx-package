/**
 * @file 本地 仓库
 * @author sparklewhy@gmail.com
 */

var fs = require('fs');
var path = require('path');
var util = require('util');
var Promise = require('bluebird');
var decompress = require('./decompress');
var Repos = require('./repository');
var config = require('../config');
var helper = require('../helper');

/**
 * 创建 本地 仓库实例
 *
 * @constructor
 * @extends Repository
 * @param {Object} options 创建选项
 * @param {string} options.source 文件路径
 * @param {string} options.version 安装版本号
 * @param {string} options.name 安装的包名称
 */
function LocalRepos(options) {
    Repos.call(this, config.reposType.LOCAL, options);

    this.filePath = options.source;
    this.resolvedPath = path.resolve(process.cwd(), this.filePath);
    this.url = this.resolvedUrl || this.resolvedPath;
    this.pkgName = path.basename(this.resolvedPath);
}

util.inherits(LocalRepos, require('./repository'));

/**
 * 是否需要 resolve 要下载包的信息，确定下载路径
 *
 * @override
 * @return {boolean}
 */
LocalRepos.prototype.needResolve = function () {
    return false;
};

/**
 * 下载包
 *
 * @override
 * @return {Promise}
 */
LocalRepos.prototype.download = function () {

    var me = this;
    var filePath = this.getResolvedUrl();

    if (!filePath) {
        return Promise.reject('unknown file path');
    }

    me.debug('begin load package from local: %s...', filePath);

    return new Promise(function (resolve, reject) {
        var state = fs.statSync(filePath);
        var targetDirName = helper.md5(filePath);
        var cacheDir = path.join(me.getDownloadCacheDir(), targetDirName);

        require('mkdirp').sync(cacheDir);

        if (state.isDirectory()) {
            helper.copyDirectory(filePath, cacheDir);
            resolve({
                decompressDir: cacheDir
            });
        }
        else if (state.isFile()) {
            resolve(decompress(filePath, cacheDir));
        }
    }).then(
        function (result) {
            return {
                dir: result.decompressDir,
                resolvedUrl: filePath
            };
        }
    );
};

/**
 * 获取仓库安装源
 *
 * @override
 * @return {Object}
 */
LocalRepos.prototype.getInstallSource = function () {
    return {
        type: this.type,
        path: this.type + ':' + this.filePath
    };
};

/**
 * 获取仓库下载的依赖使用的 endpoint
 *
 * @override
 * @return {void}
 */
LocalRepos.prototype.getDepEndPoint = function () {
    return;
};

module.exports = exports = LocalRepos;
