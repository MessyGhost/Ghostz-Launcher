import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as AdmZip from 'adm-zip';
import * as util from './util';
import {AuthAccount} from './auth'

export interface RequiredInfo {
    osName: string;
    osVersion: string;
    osArch: string;
}

export interface GameFeatures {
    is_demo_user: boolean;
    has_custom_resolution: boolean;
}

interface BlockContainsRules {
    rules: any[];
    value: string | string[];
}

interface LaunchArguments {
    jvmArgs: string[];
    gameArgs: string[];
    loggingArgs: string[];
}

function isAllowed(rules: any[], rqdInfo: RequiredInfo, gameFeatures: GameFeatures): boolean {
    let isRuleMatched = (rule: any) => {
        let result = true;
        let andResult = (value: boolean) => result = result && value;
        if (rule.os) {
            if (rule.os.arch) {
                andResult(util.isArchMatched(rule.os.arch, rqdInfo.osArch));
            }
            if (rule.os.name) {
                andResult(util.isOSNameMatched(rule.os.name, rqdInfo.osName));
            }
            if (rule.os.version) {
                andResult(util.isOSVersionMatched(rule.os.version, rqdInfo.osVersion));
            }
        }
        if (rule.features) {
            for (let feature in rule.features) {
                andResult((<any>gameFeatures)[feature] === rule.features[feature]);
            }
        }
        return result;
    }

    let allowed = false;
    for (let rule of rules) {
        if (rule.action === 'allow' && isRuleMatched(rule)) {
            allowed = true;
        }
        else if (rule.action === 'disallow' && isRuleMatched(rule)) {
            return false;
        }
    }
    return allowed;
}

interface Library {
    name: string;
}

interface PatchContent {
    launchArguments: LaunchArguments;
    libraries: Library[];
    mainClass: string | null;
    assetsIndex: string | null;
    inheritsFrom: string | null;
}

interface Resource {
    path: string;
    sha1: string;
    size: number;
    url: URL;
}

interface LibInfo {
    package: string;
    name: string;
    version: string;
}

export class LaunchCore implements LaunchCore {
    private gameDir: string;

    constructor(gameDir: string) {
        this.gameDir = gameDir;
    }

    /*启动游戏 */
    launch(gameVersion: string, account: AuthAccount, rqdInfo: RequiredInfo, gameFeatures: GameFeatures): void {
        let clientDotJson: PatchContent, requiredLibs: string[];;
        //解析Json
        clientDotJson = LaunchCore.resolveClientDotJson(
            JSON.parse(fs.readFileSync(
                path.join(this.gameDir, 'versions', gameVersion, gameVersion + '.json')).toString()),
            rqdInfo, gameFeatures);
        //查找库文件
        requiredLibs = this.resolveLibFiles(clientDotJson.libraries,
            rqdInfo,
            (gameDir: string, libraryName: Library): boolean => {
                return false;
            });


        let classpath = '';
        for (let lib of requiredLibs) {
            classpath += `${lib};`
        }
        classpath += `${path.join(this.gameDir, 'versions', gameVersion, gameVersion + '.jar')}`;

        let gamePrts = {
            auth_player_name: account.userName,
            version_name: gameVersion,
            game_directory: this.gameDir,
            assets_root: path.join(this.gameDir, 'assets'),
            assets_index_name: clientDotJson.assetsIndex,
            auth_uuid: account.uuid,
            auth_access_token: account.accessToken,
            user_type: 'mojang',
            version_type: 'Ghost\'s Launcher',
            natives_directory: path.join(this.gameDir, 'bin'),
            launcher_name: 'GhostzLauncher',
            launcher_version: '1.0.0',
            classpath: classpath
        };

        let jvmArgs: string[] = [], gameArgs: string[] = [];
        for (let arg of clientDotJson.launchArguments.jvmArgs) {
            jvmArgs.push(util.formatString(arg, gamePrts));
        }
        for (let arg of clientDotJson.launchArguments.gameArgs) {
            gameArgs.push(util.formatString(arg, gamePrts));
        }

        if (clientDotJson.mainClass) {
            let args = jvmArgs.concat([clientDotJson.mainClass], gameArgs)
            let strArgs = 'java ';
            for (let arg of args) {
                strArgs += `"${arg}" `
            }
            console.log(strArgs);
            cp.spawn('java', args, { cwd: this.gameDir }).disconnect();
        }
        else {
            throw Error('启动失败：无mainClass');
        }
    }

    //解析需要的库文件
    resolveLibFiles(libraries: Library[], rqdInfo: RequiredInfo, onMissed: (gameDir: string, libraryName: Library) => boolean): string[] {
        //由库文件名获得库文件信息（包名、库名、版本）
        let name2Info = (name: string): LibInfo => {
            let libPath: string[] = util.sliceString(name, ':');
            if (libPath.length != 3) {
                throw Error(`库文件 ${name} 无法被解析。`);
            }
            return { package: libPath[0], name: libPath[1], version: libPath[2] };
        }
        let result: string[] = [];
        for (let library of libraries) {
            let libInfo = name2Info(library.name);
            let directory = path.join(this.gameDir, 'libraries', libInfo.package.replace(/\./g, '/'), libInfo.name, libInfo.version);
            let apiFile = path.join(directory, `${libInfo.name}-${libInfo.version}.jar`);
            try {
                fs.accessSync(apiFile);
                result.push(apiFile);
            }
            catch (err) {
                if (!((<any>library).downloads && !(<any>library).downloads.artifact && (<any>library).natives)) {
                    throw Error(`库文件缺失：${library.name}。`);
                }
            }

            if ((<any>library).natives) {
                let selector: string | null = null;
                for (let key in (<any>library).natives) {
                    if (util.isOSNameMatched(key, rqdInfo.osName)) {
                        selector = (<any>library).natives[key];
                    }
                }
                if (typeof (selector) === 'string') {
                    let nativeCompressedFile: string = path.join(directory, `${libInfo.name}-${libInfo.version}-${selector}.jar`);
                    try {
                        let fd = fs.openSync(nativeCompressedFile, 'r');
                        let data = fs.readFileSync(fd);
                        let admZip = new AdmZip(data);
                        admZip.getEntries().map(
                            entry => {
                                if (!(<any>library).extract || !(<any>library).extract.exclude.includes(entry.entryName + '/')) {
                                    admZip.extractEntryTo(entry, path.join(this.gameDir, 'bin'), false, true);
                                }
                            }
                        );
                        fs.closeSync(fd);
                    }
                    catch (err) {
                        throw err;
                    }
                }
            }
        }
        return result;
    }

    /*解析Client.json*/
    static resolveClientDotJson(clientDotJson: any, rqdInfo: RequiredInfo, gameFeatures: GameFeatures): PatchContent {
        let mainClass: string | null = null, assetsIndex: string | null = null;
        let resolvePatch = (patch: any) => {
            let mainClass: string | null = null, assetsIndex: string | null = null;
            if (patch.mainClass) { mainClass = patch.mainClass; }
            if (patch.assets) { assetsIndex = patch.assets; }
            //if(patch.logging.client.argument)loggingArgs: string[] = [patch.logging.client.argument];


            let concatArgument = (target: string[], arg: string[] | string): string[] => {
                let appendingContent: string[] = [];
                if (arg instanceof Array) {
                    appendingContent = arg;
                }
                else if (typeof (arg) === 'string') {
                    appendingContent = [arg];
                }
                return target.concat(appendingContent);
            }

            /*1.13+：返回jvm和游戏参数（未格式化） */
            let resolveArguments = (args: any) => {
                let gameArgs: string[] = [], jvmArgs: string[] = [];
                //游戏参数
                if (args.game) {
                    for (let arg of args.game) {
                        let appendingContent: string[] | string;
                        if (typeof (arg) === 'string') {
                            appendingContent = arg;
                        }
                        else {
                            let blockContainsRules: BlockContainsRules = arg;
                            if (isAllowed(blockContainsRules.rules, rqdInfo, gameFeatures)) {
                                appendingContent = blockContainsRules.value;
                            }
                            else {
                                appendingContent = [];
                            }
                        }
                        gameArgs = concatArgument(gameArgs, appendingContent);
                    }
                }
                //jvm参数
                if (args.jvm) {
                    for (let arg of args.jvm) {
                        let appendingContent: string[] | string;
                        if (typeof (arg) === 'string') {
                            appendingContent = arg;
                        }
                        else {
                            let blockContainsRules: BlockContainsRules = arg;
                            if (isAllowed(blockContainsRules.rules, rqdInfo, gameFeatures)) {
                                appendingContent = blockContainsRules.value;
                            }
                            else {
                                appendingContent = [];
                            }
                        }
                        jvmArgs = concatArgument(jvmArgs, appendingContent);
                    }
                }
                return {
                    gameArgs: gameArgs,
                    jvmArgs: jvmArgs
                };
            }

            /*返回所需的库的列表 */
            let resolveLibraries = (libraries: any[]): Library[] => {
                let result: Library[] = [];
                for (let library of libraries) {
                    if (!library.rules || isAllowed(library.rules, rqdInfo, gameFeatures)) {
                        result.push(library);
                    }
                }
                return result;
            }
            let jvmArgs: string[], gameArgs: string[], overwriteGameArgs = false;
            //1.13+
            if (patch.arguments) {
                let resolvedArguments = resolveArguments(patch.arguments);
                jvmArgs = resolvedArguments.jvmArgs;
                gameArgs = resolvedArguments.gameArgs;
            }
            //1.12
            else {
                overwriteGameArgs = true;
                jvmArgs = ['-cp', '${classpath}', '-Djava.library.path=${natives_directory}'];
                gameArgs = util.sliceString(patch.minecraftArguments, ' ');
            }

            return {
                launchArguments: { gameArgs: gameArgs, jvmArgs: jvmArgs, loggingArgs: /*loggingArgs*/[''] },
                libraries: resolveLibraries(patch.libraries), mainClass: mainClass, assetsIndex: assetsIndex, 
                overwriteGameArgs: overwriteGameArgs
            };
        }

        let jvmArgs: string[] = [], gameArgs: string[] = [], loggingArgs: string[] = [], libraries: Library[] = [], inheritsFrom: string | null = null;
        if (clientDotJson.patches) {
            for (let patch of clientDotJson.patches) {
                let patchResult = resolvePatch(patch);
                let launchArguments = patchResult.launchArguments;
                jvmArgs = jvmArgs.concat(launchArguments.jvmArgs);
                if(patchResult.overwriteGameArgs) {
                    gameArgs = launchArguments.gameArgs;
                }
                else {
                    gameArgs = gameArgs.concat(launchArguments.gameArgs);
                }
                loggingArgs = loggingArgs.concat(launchArguments.loggingArgs);
                libraries = libraries.concat(patchResult.libraries);

                if (patchResult.mainClass) mainClass = patchResult.mainClass;
                if (patchResult.assetsIndex) assetsIndex = patchResult.assetsIndex;
            }
        }
        else {
            let patchResult = resolvePatch(clientDotJson);
            let launchArguments = patchResult.launchArguments;
            jvmArgs = launchArguments.jvmArgs;
            if(patchResult.overwriteGameArgs) {
                gameArgs = launchArguments.gameArgs;
            }
            else {
                gameArgs = gameArgs.concat(launchArguments.gameArgs);
            }
            loggingArgs = launchArguments.loggingArgs;
            libraries = patchResult.libraries;

            if (patchResult.mainClass) mainClass = patchResult.mainClass;
            if (patchResult.assetsIndex) assetsIndex = patchResult.assetsIndex;
        }
        return { launchArguments: { jvmArgs: jvmArgs, gameArgs: gameArgs, loggingArgs: loggingArgs }, libraries: libraries, mainClass: mainClass, assetsIndex: assetsIndex, inheritsFrom: clientDotJson.inheritsFrom};
    }
}
