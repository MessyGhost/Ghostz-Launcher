import * as path from 'path';
import * as os from 'os';
import * as electron from 'electron';
import * as util from './util';
import { LaunchCore, RequiredInfo } from './launch_core';
import * as fs from 'fs';
import { MojangAccount, AuthAccount } from './auth';

let remoteWindow = electron.remote.getCurrentWindow();
let pageController: PageController;
remoteWindow.on('close', e => {
    fs.mkdirSync('./.glauncher');
    fs.accessSync('./.glauncher');

    let account = pageController.getCurrentAccount();
    if(account) {
        fs.writeFileSync('./.glauncher/accounts.json', JSON.stringify([account]));
    }
});

class RippleEffectController {
    constructor(elements: HTMLElement[]) {
        for (let element of elements) {
            element.addEventListener('click', this.onclick);
        }
    }

    public addEffect(element: HTMLElement) {
        element.classList.add('with-ripple-effect');
        element.addEventListener('click', this.onclick);
    }

    private onclick(event: MouseEvent): void {
        let element = (<HTMLElement>event.target);
        let ripple = document.createElement('div');

        let rippleColor = element.getAttribute('data-ripple-color');
        if (!rippleColor) { rippleColor = 'darkgray'; }

        let r = Math.max(element.clientWidth, element.clientHeight)

        ripple.style.width = ripple.style.height = r + 'px';
        ripple.style.left = event.offsetX - r / 2.0 + 'px';
        ripple.style.top = event.offsetY - r / 2.0 + 'px';
        ripple.style.backgroundColor = rippleColor;

        element.appendChild(ripple);
        ripple.classList.add('ripple');
        setTimeout(() => element.removeChild(ripple), 400);
    }
}

class PageController {
    private gameDir: string;
    private systemInfo: RequiredInfo;

    private rippleEffectController: RippleEffectController;

    private menuBar: HTMLDivElement;
    private contentBlock: HTMLDivElement;
    private accountBar: HTMLDivElement;
    private loginButton: HTMLButtonElement;
    private acPasswordInput: HTMLInputElement;
    private acEmailInput: HTMLInputElement;

    private currentAccount: AuthAccount | null;

    private static INSTANCE: PageController;

    constructor() {
        PageController.INSTANCE = this;
        this.gameDir = electron.ipcRenderer.sendSync('request', 'gameDir');
        this.systemInfo = { osArch: os.arch(), osName: os.platform(), osVersion: os.release() };
        this.currentAccount = null;
        
        this.rippleEffectController = new RippleEffectController(util.nodeList2Array(document.querySelectorAll('.with-ripple-effect')));

        try {
            this.menuBar = util.throwIfIsNull(document.getElementById('menu-bar'));
            this.contentBlock = util.throwIfIsNull(document.getElementById('content-block'));
            this.accountBar = util.throwIfIsNull(document.getElementById('account-bar'));

            this.acEmailInput = util.throwIfIsNull(document.getElementById('ac-email'));
            this.acPasswordInput = util.throwIfIsNull(document.getElementById('ac-password'));
            this.loginButton = util.throwIfIsNull(document.getElementById('login-button'));
        }
        catch (err) {
            throw Error('加载的页面不正确。');
        }

        this.onMenuBarSelectedItemChanged('home-button');
        this.loadAccountsFromFile();

        util.iterateHTMLCollection(this.menuBar.children, element => {
            element.addEventListener('click', event => PageController.INSTANCE.onMenuBarItemClick(event));
        });
        this.loginButton.addEventListener('click', () => 
            PageController.INSTANCE.login(PageController.INSTANCE.acEmailInput.value, PageController.INSTANCE.acPasswordInput.value));
    }

    private login(email: string, password: string) {
        MojangAccount.construct(email, password)
        .then(data => {
          this.setAccount(data);
          
      }).catch(err => {
            this.setAccount(null);
      });
    }

    public setAccount(account: AuthAccount | null) {
        if(account) {
            this.loginButton.textContent = '已登录';
            this.currentAccount = account;
        }
        else {
            this.loginButton.textContent = '登录';
        }
    }

    public getCurrentAccount(): AuthAccount | null {
        return this.currentAccount;
    }

    private loadAccountsFromFile() {
        try {
            let accounts = fs.readFileSync('./.glauncher/accounts.json');
            this.setAccount(JSON.parse(accounts.toString())[0]);
        }
        catch(err) {

        }
    }

    private makeHomeUI(): HTMLElement[] {
        let result: HTMLElement[] = [];
        fs.readdirSync(path.join(this.gameDir, 'versions')).forEach(
            value => {
                let _path = path.join(this.gameDir, 'versions', value);
                if (fs.lstatSync(_path).isDirectory) {
                    let selectableVersion: HTMLDivElement = document.createElement('div');
                    selectableVersion.addEventListener('click', e => PageController.INSTANCE.onLaunch(value));
                    selectableVersion.dataset.rippleColor = 'gray';
                    selectableVersion.textContent = value;
                    selectableVersion.classList.add('version-item');
                    this.rippleEffectController.addEffect(selectableVersion);
                    result.push(selectableVersion);
                }
            }
        );
        return result;
    }

    private onMenuBarSelectedItemChanged(changdToId: string) {
        this.contentBlock.innerHTML = '';
        if (changdToId === 'home-button') {
            this.makeHomeUI().map(value => {
                this.contentBlock.appendChild(value);
            });
        }
    }

    private onMenuBarItemClick(event: Event) {
        let element = (<Element>event.target);
        document.querySelectorAll('#menu-bar *').forEach(e => {
            if (e.classList.contains('selected-menu-button') && e != element) {
                this.onMenuBarSelectedItemChanged(element.id);
            }
            e.classList.remove('selected-menu-button')
        });
        element.classList.add('selected-menu-button');
    }

    private onLaunch(version: string) {
        return new Promise<void>((resolve, reject) => {
            if(!this.currentAccount) throw Error('没有账号。');
            new LaunchCore(this.gameDir).launch(version, this.currentAccount, this.systemInfo, { is_demo_user: false, has_custom_resolution: false });
            resolve();
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    pageController = new PageController();
});
