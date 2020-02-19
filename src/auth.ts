import * as uuid from 'uuid';
import * as https from 'https';

const launcherUID = '3db50481-84f6-4060-9439-42b78ac1b62c';

export interface AuthAccount {
    userName: string,
    uuid: string;
    accessToken: string;
}

export class MojangAccount implements AuthAccount {
    userName: string;
    uuid: string;
    accessToken: string;
    public static async construct(email: string, password: string) : Promise<MojangAccount> {
        let result : any = await MojangAccount.login(email, password);
        if(result.error) {
            throw Error(result.errorMessage);
        }
        return new Promise<MojangAccount>((resolve, reject) => {
            resolve(new MojangAccount(result.selectedProfile.name, result.selectedProfile.id, result.accessToken));
        });
    }
    private constructor(userName: string, uuid: string, accessToken: string) {
        this.userName = userName;
        this.uuid = uuid;
        this.accessToken = accessToken;
    }

    private static async login(email: string, password: string) {
        return new Promise((resolve, reject) => {
            let data = '';
            let request = https.request('https://authserver.mojang.com/authenticate', { method: 'POST', headers: {header: 'Content-Type: application/json'}}, res => {
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(JSON.parse(data)));
                res.on('error', err => reject(err));
            });
            request.end(JSON.stringify(
                { username: email, password: password, requestUser: true, clientToken: launcherUID, 
                    agent: { name: 'Minecraft', version: 1 } }
                ));
        });
    }
}

