

export function formatString(string : string, map : any) {
    let result = ''
    for (let i = 0; i < string.length; ++i) {
        let char = string.charAt(i)
        if (char == '$') {
            if (++i < string.length && string.charAt(i) == '{') {
                let varName = ''
                while (i++ < string.length && string.charAt(i) != '}') {
                    varName += string.charAt(i)
                }
                if (string.charAt(i) == '}') {
                    let val = map[varName]? map[varName] : '${' + varName + '}';
                    result += val? val : '${' + varName + '}';
                }
                else {
                    throw Error('无法格式化字符串：“${”后无“}”结尾。')
                }
            }
        }
        else {
            result += char
        }
    }
    return result
}

export class Version {
    static fromString(versionString : string) : Version {
        let s = sliceString(versionString, '\\.');
        if(s.length < 1 || s.length > 3) {
            throw Error(`错误版本号：${versionString}`)
        }
        return new Version(Number(s[0]), Number(s[1]?s[1]:0), Number(s[2]?s[2]:0))
    }

    constructor(majorVersion : number, minorVersion = 0, buildVersion = 0) {
        this.majorVersion = majorVersion;
        this.minorVersion = minorVersion;
        this.buildVersion = buildVersion;
    }
    
    toString() : string {
        return `${this.majorVersion}.${this.minorVersion}.${this.buildVersion}`;
    }
    majorVersion : number;
    minorVersion : number;
    buildVersion : number;
}

export function isOSNameMatched(targetOS: string, currentOS: string): boolean {
    if (targetOS === 'windows') {
        switch (currentOS) {
            case 'win32':
                return true;
            default:
                return false;
        }
    }
    else if (targetOS === 'osx') {
        switch (currentOS) {
            case "darwin":
                return true;
            default:
                return false;
        }
    }
    return targetOS === 'unknown' || targetOS === currentOS;
}

export function isOSVersionMatched(targetVersionExpression: string, currentVersionString: string): boolean {
    if (targetVersionExpression.charAt(0) === '^') {
        let targetLowestVersion = Version.fromString(targetVersionExpression.substring(1, targetVersionExpression.length - 1));
        let currentVersion = Version.fromString(currentVersionString)
        if (targetLowestVersion.majorVersion < currentVersion.majorVersion) {
            return true;
        }
        else if (targetLowestVersion.majorVersion === currentVersion.majorVersion) {
            if (targetLowestVersion.minorVersion < currentVersion.minorVersion) {
                return true;
            }
            else if (targetLowestVersion.minorVersion === currentVersion.minorVersion) {
                return targetLowestVersion.buildVersion <= currentVersion.buildVersion;
            }
            else {
                return false;
            }
        }
        return false;
    }
    return false;
}

export function isArchMatched(targetArch: string, currentArch: string) : boolean {
    if (targetArch === 'x86') {
        switch (currentArch) {
            case 'x32':
            case 'x64':
                return true;
            default:
                return false;
        }
    }
    return targetArch === currentArch;
}

export function sliceString(source : string, matcher : string) : string[] {
    let result : string[] = [];
    let strLeft = source;
    let index = 0;
    while((index = strLeft.search(matcher)) != -1) {
        result.push(strLeft.substring(0, index));
        strLeft = strLeft.substring(index + matcher.length);
    }
    if(strLeft.length > 0) result.push(strLeft);
    return result;
}

export function throwIfIsNull(object : any) {
    if(!object) {throw Error('对象为空');}
    return object;
}

export function iterateHTMLCollection(collection : HTMLCollection, callback : (element : Element, index : number) => void) {
    for(let i = 0; i < collection.length; ++i) {
        let element = collection.item(i);
        if(element) callback(element, i);
    }
}

export function nodeList2Array<T extends Node>(nodeList : NodeListOf<T>) : T[] {
    let result : T[] = [];
    nodeList.forEach(element => result.push(element));
    return result;
}
