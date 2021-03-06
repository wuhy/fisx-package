/**
 * @file 安装结果信息的打印工具方法
 * @author sparklewhy@gmail.com
 */

require('colors');

var assign = require('object-assign');
var util = require('util');
var project = require('./project');
var config = require('./config');
var logger = config.log;
var helper = require('./helper');
var colorize = helper.colorize;
var semver = require('./repos/semver');
var formatUtil = require('./format');
var getSpaceStr = formatUtil.getSpaceStr;

var printHelper = require('./printHelper');
var getPkgNameInfo = printHelper.getPkgNameInfo;
var getAllInstallPkgs = printHelper.getAllInstallPkgs;

/* eslint-disable no-console */

/**
 * 获取依赖树前缀的字符串
 *
 * @inner
 * @param {number} deep 当前所处深度
 * @param {number} indent 缩进的空格数
 * @param {Array.<boolean>} parents 其所有父（祖父）节点是所在层级最后一个节点
 * @return {string}
 */
function getTreePrefixStr(deep, indent, parents) {
    var str = '';
    var i = 0;
    while (i < deep) {
        if (parents[i]) {
            str += getSpaceStr(indent);
        }
        else {
            str += '│'.gray + getSpaceStr(indent - 1);
        }
        i++;
    }

    return str;
}

function getExpectVersionInfo(pkgVersion, expectedPkg) {
    var expectVersion = expectedPkg.version;
    if (expectVersion && expectVersion !== '*'
        && expectVersion !== 'latest' && expectVersion !== pkgVersion
    ) {
        var expectInfo = ' expect ' + expectVersion;
        if (semver.satisfies(pkgVersion, expectVersion)) {
            expectInfo = ''; // expectInfo.gray;
        }
        else {
            expectInfo = expectInfo.red;
        }
        return expectInfo;
    }

    return '';
}

function getPkgInstallTitle(expectedPkg, installPkg) {
    var pkgInfo = getPkgNameInfo(installPkg);
    var pkgName = pkgInfo.name;
    var pkgVersion = pkgInfo.version;
    var type = (pkgInfo.type || '').yellow;
    var pkgInfoStr = type + (pkgVersion ? (pkgName + '@' + pkgVersion).green : pkgName.green);

    var expectInfo = expectedPkg && getExpectVersionInfo(pkgVersion, expectedPkg);
    expectInfo && (pkgInfoStr += expectInfo);
    return pkgInfoStr;
}

function getInstallCmdPkgInfo(pkg, option) {
    var rawPkg = pkg;
    pkg = pkg.getRealPackage();

    var pkgInfo = getPkgInstallTitle(rawPkg, pkg);
    var deep = option.deep;
    var isUpdate = option.update;
    var info;
    if (!deep) {
        // 第一层才显示安装结果信息
        if (pkg.installed) { // 如果已经成功安装了
            // if (pkg.useCache) {
            //    pkgInfo += ' use cache'.gray;
            // }
            if (pkg.alreadyInstalled && !pkg.newInstalled) {
                info = isUpdate ? ' update none' : ' installed';
                pkgInfo += info.gray;
            }

            // 安装过程中可以存在安装卸载再安装过程
            if (pkg.oldVersion) {
                var replaceInfo = ' replace ' + pkg.oldVersion;
                pkgInfo += replaceInfo.yellow;
            }
            else if (isUpdate && pkg.newInstalled) {
                pkgInfo += ' new'.yellow;
            }
        }
        else {
            var op = pkg.degrade ? ' degrade' : ' update';
            var installVersion = pkg.installVersion;
            var updateInfo;
            if (installVersion) {
                updateInfo = op + ' ' + installVersion + ' fail';
            }
            else {
                updateInfo = op + ' fail';
            }
            info = isUpdate
                ? updateInfo
                : ' install fail';
            pkgInfo += info.red;
        }
    }

    return pkgInfo;
}

function getPkgUpdateInfo(pkg) {
    var updateData = pkg.updateData;
    var updateInfo = '';

    if (updateData) {
        if (updateData.err) {
            updateInfo = ' fetch update info fail'.red;
        }
        else {
            updateInfo = [];
            var compatVer = updateData.compatVersion;
            compatVer && (updateInfo.push('compat '.green + String(compatVer).cyan.bold));
            var latestVer = updateData.latestVersion;
            latestVer && (updateInfo.push('latest '.green + String(latestVer).cyan.bold));
            updateInfo = updateInfo.length
                ? updateInfo.join(' ')
                : '';
        }
    }

    return updateInfo;
}

function getListCmdPkgInfo(pkg, option) {
    var rawPkg = pkg;
    pkg = pkg.getRealPackage();

    var pkgInfo = '';
    var deep = option.deep;

    if (deep) {
        pkgInfo += (pkg.installed ? '' : 'UNMET DEPENDENCY ').red;
        pkgInfo += getPkgInstallTitle(rawPkg, pkg);
    }
    else {
        // 项目包信息
        pkgInfo += (pkg.getNameVersionInfo() || '');
        option.rootInfo && (pkgInfo += ' ' + option.rootInfo);
    }

    if (pkg.installed && deep) {
        if (deep === 1) {
            if (pkg.isDevDep && !pkg.isDep) {
                pkgInfo += ' devDependencies'.green;
            }
            else if (!pkg.isDep && !pkg.isDevDep) {
                pkgInfo += ' extraneous'.red;
            }
        }

        var updateInfo = getPkgUpdateInfo(pkg);
        if (updateInfo) {
            pkgInfo += ' ' + updateInfo;
        }
    }

    return pkgInfo;
}

/**
 * 初始化包安装信息
 *
 * @inner
 * @param {Package} pkg 安装的包
 * @param {Object} option 打印信息的选项
 * @param {boolean=} option.update 是否是更新操作
 * @param {boolean=} option.ls 是否是 `list` 命令，可选，默认 false，即 `install` 命令
 * @param {number} option.deep 当前初始化的包的深度，根节点从 0 开始
 * @param {number=} option.allowDepth 允许打印的深度，可选，默认只打印两层
 * @param {Array.<string>} option.infos 初始化的包的信息
 * @param {number} option.totalIndent 打印信息的整体缩进
 * @param {number} option.indent 打印的树状结构的缩进
 * @param {boolean} option.isLast 是否是当层节点的最后一个节点
 * @param {Array.<boolean>} option.parents 其所有父（祖父）节点是所在层级最后一个节点
 * @param {string=} option.rootInfo 显示在根节点旁边的信息，可选，`option.ls` 为 `true` 时才有效
 */
function initPkgInstallInfo(pkg, option) {
    var rawPkg = pkg;
    pkg = pkg.getRealPackage();

    var deep = option.deep;
    var currParents = option.parents || [];
    var pkgInfo = getTreePrefixStr(deep, option.indent, currParents);

    pkgInfo += (option.isLast ? '└── ' : '├── ').gray;
    pkgInfo += (option.ls
        ? getListCmdPkgInfo(rawPkg, option)
        : getInstallCmdPkgInfo(rawPkg, option));

    pkgInfo = getSpaceStr(option.totalIndent || 0) + pkgInfo;

    option.infos.push(pkgInfo);

    var isParentLast = option.isLast;
    if (deep <= (option.allowDepth || 0)) {
        var deps = pkg.getDependencies();
        var lastIdx = deps.length - 1;
        var parents = [].concat(currParents, isParentLast);
        deps.forEach(function (dep, index) {
            initPkgInstallInfo(dep, assign({}, option, {
                deep: deep + 1,
                isLast: index === lastIdx,
                parents: parents
            }));
        });
    }
}

/**
 * 列出包所有可用的版本信息
 *
 * @inner
 * @param {Object} versionData 版本信息数据
 * @param {Object} options 选项
 * @param {string} options.name 包的名称
 * @param {number=} options.lineNum 一行显示的可用的版本号的数量
 */
function listPkgAllVersionInfos(versionData, options) {
    if (!versionData) {
        return;
    }

    options || (options = {});

    var infos = [];
    var prefixIndent = getSpaceStr(4);
    Object.keys(versionData).forEach(function (type) {
        if (!versionData[type]) {
            return;
        }

        var versionInfo = prefixIndent + type.toUpperCase().grey + ': ';
        var versions = [];
        var maxVersionWidth = 0;
        versionData[type].forEach(function (item) {
            var str = '';
            if (item.tag) {
                str += item.tag.green;
                if (item.version && item.version !== item.tag) {
                    str += (' (' + item.version + ')').cyan;
                }
            }
            else {
                str += item.version.cyan;
            }

            if (str.length > maxVersionWidth) {
                maxVersionWidth = str.length;
            }

            versions.push(str);
        });

        var lineVersionNum = options.lineNum || 4;
        for (var i = 0, len = versions.length; i < len; i++) {
            if (i % lineVersionNum === 0) {
                versionInfo += '\n' + prefixIndent;
            }

            versionInfo += (versions[i]
            + getSpaceStr(maxVersionWidth - versions[i].length + 2));
        }

        infos.push(versionInfo);
    });

    logger.info('%s package all available versions:', options.name.green);
    console.log('\n' + infos.join('\n\n'));
}

/**
 * 基于树结构打印包信息
 *
 * @param {Package} projectPkg 包根节点
 * @param {Object} options 选项信息
 */
function listPackageByTree(projectPkg, options) {
    // 打印安装结果信息
    var infos = [];
    initPkgInstallInfo(projectPkg, {
        ls: true,
        deep: 0,
        allowDepth: options.depth || 3,
        infos: infos,
        totalIndent: 2,
        indent: 4,
        isLast: true
        // rootInfo: projectPkg.root.cyan
    });

    var specifyName = options.name;
    var title;
    if (specifyName) {
        title = specifyName.green + ' install';
    }
    else {
        title = 'Install';
    }

    logger.info('project root: '. green + projectPkg.root.cyan);
    logger.info(title + ' info:\n' + infos.join('\n'));
}

function getPkgDetailInfo(pkg, expectPkg, notInstallPkgs) {
    var metaData = pkg.metaData || {};
    var pkgInfo = getPkgNameInfo(pkg);
    var errorInfo = '';
    if (pkg.installed) {
        if (pkg.isDevDep && !pkg.isDep) {
            errorInfo = ' devDependencies'.cyan;
        }
        else if (!pkg.isDep && !pkg.isDevDep) {
            errorInfo = ' extraneous'.red;
        }
    }
    else {
        errorInfo = 'not installed';
        notInstallPkgs.push(pkgInfo.name);
    }

    var type = (pkgInfo.type || '').yellow;
    var pkgInfoStr = type + pkgInfo.name + ' ' + errorInfo.red;
    var expectInfo = getExpectVersionInfo(pkgInfo.version, expectPkg);
    var updateInfo = getPkgUpdateInfo(pkg);

    var depInfo = [];
    pkg.getDependencies().forEach(function (item, index) {
        depInfo[index] = getPkgInstallTitle(null, item.getRealPackage());
    });
    depInfo = depInfo.join(', ');

    var authorInfo = printHelper.getPkgAuthorInfo(metaData);
    var result = {
        name: pkgInfoStr,
        version: (pkg.installVersion || '-')
        + ' ' + [expectInfo, updateInfo].join(' ')
    };

    var versionInfo = (metaData.versions || {})[pkg.installVersion] || {};
    assign(result, authorInfo, {
        licence: printHelper.getLicenceInfo(metaData),
        keywords: printHelper.getKeywordsInfo(metaData),
        description: metaData.description ? metaData.description.gray : '',
        homepage: colorize(metaData.homepage, 'link'),
        repository: colorize(pkg.getRepositoryUrl(), 'link'),
        dependencies: depInfo,
        deprecated: versionInfo.deprecated ? versionInfo.deprecated.red : ''
    });
    return result;
}

/**
 * 基于列表形式打印包的信息
 *
 * @param {Package} pkg 要打印的包的信息
 * @param {Object} options 选项信息
 * @param {Object} listedMap 已经打印过的包 map
 * @param {number} depth 打印依赖深度
 */
function listPackageByList(pkg, options, listedMap, depth) {
    var expectPkg = pkg;
    pkg = pkg.getRealPackage();

    if (depth > options.depth) {
        return;
    }

    if (listedMap[pkg.name]) {
        return;
    }
    listedMap[pkg.name] = 1;

    if (pkg.isRoot) {
        logger.info('project root: '. green + pkg.root);

        if (options.name) {
            logger.info('installed package ' + options.name.green + ' info:');
        }
        else {
            console.log('');
        }
    }
    else {
        var pkgDetail = getPkgDetailInfo(pkg, expectPkg, listedMap.notInstallPkgs);
        var fields = Object.keys(pkgDetail);

        var fieldShows = fields.map(function (k) {
            return k + ':';
        });
        fieldShows = formatUtil.alignColumn(fieldShows, 'left', function (value) {
            return (getSpaceStr(4) + value + ' ').green;
        });

        for (var i = 0, len = fields.length; i < len; i++) {
            var value = pkgDetail[fields[i]];
            value && console.log(fieldShows[i] + value);
        }

        console.log('');
    }

    pkg.getDependencies().forEach(function (item) {
        listPackageByList(item, options, listedMap, depth + 1);
    });
}

/**
 * 打印安装结果信息
 *
 * @param {Array.<Package>} installPkgs 安装的包
 * @param {boolean} isUpdate 是否是更新操作
 */
exports.printInstallInfo = function (installPkgs, isUpdate) {
    installPkgs = getAllInstallPkgs(installPkgs);

    var infos = [];
    var lastIdx = installPkgs.length - 1;
    installPkgs.forEach(function (pkg, idx) {
        initPkgInstallInfo(pkg, {
            deep: 0,
            infos: infos,
            totalIndent: 2,
            indent: 4,
            isLast: idx === lastIdx,
            update: isUpdate
        });
    });

    var prefix = isUpdate ? 'Update' : 'Install';
    if (infos.length) {
        logger.info('%s done\n%s', prefix, infos.join('\n'));
    }
    else {
        logger.info('%s nothing', prefix);
    }
};

/**
 * 打印移除安装信息
 *
 * @param {Array.<Package|Object>} uninstallPkgs 移除安装的包
 */
exports.printUninstallInfo = function (uninstallPkgs) {
    var printInfo = [];

    uninstallPkgs.forEach(function (pkg) {
        var info;
        if (pkg.notExisted) {
            var reason = 'it is not installed in ' + project.getPkgInstallDir();
            info = 'uninstall ' + pkg.name.green + ' fail: ' + reason.red;
            logger.warn(info);
        }
        else {
            info = 'uninstall ' + pkg.getNameVersionInfo().green;
            var referPkg = pkg.refer;

            if (referPkg && !pkg.uninstalled) {
                return;
            }

            if (referPkg) {
                info += '(referred by ' + referPkg.getNameVersionInfo().yellow + ') ';
            }
            info += (pkg.uninstalled ? ' done' : ' fail'.red);
            logger[pkg.uninstalled ? 'info' : 'warn'](info);
        }
        printInfo.push(info);
    });

    logger.info('uninstall done');
};

/**
 * 打印更新失败的信息
 *
 * @param {Array.<string>} notExistedPkgs 不存在的包
 * @param {Object} options 更新选项
 */
exports.printUpdateFailInfo = function (notExistedPkgs, options) {
    var printInfo = [];
    var key = options.saveToDep ? 'dependencies' : 'devDependencies';
    notExistedPkgs.forEach(function (item, index) {
        var reason = item + ' is not defined in the key `' + key + '` of '
            + project.manifestFile;
        printInfo[index] = 'Update ' + item.green + ' fail: ' + reason.red;
    });
    logger.info(printInfo.join('\n'));
};

/**
 * 列出包的信息
 *
 * @param {Object} info 要列出的包的信息，结构如下：
 *        {
 *          installedPkgs: Array.<Package>, // 安装的包
 *          notInstallManifestPkgs: Array.<Package>, // 未安装的清单包
 *          notInstallDepPkgs: Array.<Package>, // 未安装的依赖包
 *        }
 * @param {Object=} options 选项
 */
exports.listPackages = function (info, options) {
    var projectPkg = project.getProjectPackage();
    var installedPkgs = info.installedPkgs || [];
    var notInstallManifestPkgs = info.notInstallManifestPkgs || [];
    projectPkg.setDependencies(
        installedPkgs.concat(notInstallManifestPkgs)
    );

    var specifyName = options.name;
    if (!installedPkgs.length) {
        if (specifyName) {
            logger.warn(specifyName.green + ' is not installed in: '.red + projectPkg.root.cyan);
        }
        else {
            logger.warn('No packages found in: '.red + projectPkg.root.cyan);
        }
        return;
    }

    switch (options.style) {
        case 'list':
            var listMap = {
                notInstallPkgs: []
            };
            listPackageByList(projectPkg, options, listMap, 0);

            var statInfo = [
                'Total package number including dependencies: '
                + String(Object.keys(listMap).length - 2).green
            ];

            var missNum = listMap.notInstallPkgs.length;
            if (missNum) {
                var names = listMap.notInstallPkgs.map(function (name) {
                    return name.red;
                });
                statInfo.push(
                    'missing packages: ' + names.join(', ')
                );
            }
            logger.info(statInfo.join(', '));
            break;
        default:
            listPackageByTree(projectPkg, options);
    }

    // 打印项目清单文件里定义的依赖没有安装的信息
    var projectInfo = projectPkg.getNameVersionInfo() || projectPkg.root;
    notInstallManifestPkgs.forEach(function (pkg) {
        var info = pkg.getNameVersionInfo().green + ', required by ' + projectInfo.green;
        logger.warn('missing: ' + info);
    });

    // 打印项目安装的包丢失的依赖的信息
    info.notInstallDepPkgs.forEach(function (pkg) {
        var refer = pkg.refer;
        var info = pkg.getNameVersionInfo().green + ', required by '
            + refer.getNameVersionInfo().green;
        if (project.isIngorePkg(pkg.name)) {
            info += ', is ignored in package.json'.cyan;
        }
        logger.warn('missing: ' + info);
    });

    // 打印所有可用版本信息
    listPkgAllVersionInfos(info.allVersions, {
        name: options.name,
        lineNum: options.lineNum
    });
};

/**
 * 列出搜索到的包
 *
 * @param {{count: number, list: Array.<Object>}} result 要显示的搜索结果
 * @param {string} key 搜索词
 */
exports.listSearchPkgs = function (result, key) {
    var isGithub = result.github;
    var list = result.list;
    var sumInfo = 'Found ' + String(result.count).green + ' results';
    if (list.length !== result.count) {
        sumInfo += ', show top ' + String(list.length).green;
    }

    logger.info(sumInfo + ':\n');
    list.forEach(function (pkg) {
        var pkgName = pkg.name;
        key && (pkgName = pkgName.replace(key, key.red));
        console.log(
            util.format(getSpaceStr(2) + '%s: %s', colorize(pkgName, 'success'),
                colorize(pkg.time, 'info'))
        );

        if (isGithub) {
            console.log(getSpaceStr(4) + 'stars: %s  forks: %s',
                colorize(pkg.stars, 'title'), colorize(pkg.forks, 'title')
            );
        }

        console.log(getSpaceStr(4) + '%s', colorize(pkg.description, 'info'));

        if (pkg.versions) {
            var versions = [];
            pkg.versions.forEach(function (v) {
                versions.push(v.cyan);
            });
            console.log(getSpaceStr(4) + '版本：%s', versions.join(', '));
        }

        if (pkg.url) {
            console.log(getSpaceStr(4) + '仓库：%s', colorize(pkg.url, 'link'));
        }
        console.log('');
    });
};

/* eslint-enable no-console */
