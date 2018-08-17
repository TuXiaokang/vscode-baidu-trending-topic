'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as cp from 'child_process';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as iconv from 'iconv-lite';
import sitemap from './sitemap';

axios.interceptors.response.use(function (response) {
    var ctype: string = response.headers["content-type"];
    response.data = ctype.includes("text/html") ?
      iconv.decode(response.data, 'gb2312') :
      iconv.decode(response.data, 'utf-8');
    return response;
  });

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated

    // console.log('Congratulations, your extension "vscode-baidu-trending-topic" is now active!');

    let topic = new TrendingTopic();

    let openInBrowser = vscode.commands.registerCommand('trendingTopic.openInBrowser', async () => {
        await topic.openInBrowser();
    });

    let changeColumn = vscode.commands.registerCommand('trendingTopic.changeColumn', async () => {
        await topic.changeColumn();
    });

    context.subscriptions.push(topic);
    context.subscriptions.push(openInBrowser);
    context.subscriptions.push(changeColumn);
}

// this method is called when your extension is deactivated
export function deactivate() {
}

class TrendingTopic {
    private _statusBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1111);
    private _columnBar: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1110);

    private _topics: Map<string, Array<any>> = new Map();
    private _column: string;
    private _index = -1;
    private _topN = 50;
    private _repeat = 0;

    private _pickitems: Array<any> = new Array();
    private _update_timer: any = setInterval(() => { this.waitToFetch(); }, 500);
    
    constructor() {
        this._topN = vscode.workspace.getConfiguration('trendingTopic').topN || 50;
        this._column = sitemap[0].column;
        this._columnBar.text = this._column.slice(0, 2);
        this._columnBar.command = 'trendingTopic.changeColumn';
        this._statusBar.text = '获取热点新闻中';
        this._statusBar.command = 'trendingTopic.openInBrowser';
        this._pickitems = sitemap.map(site => { return { label: site.column }; });
        this.fetchTrendingTopic();
        setInterval(() => { this.fetchTrendingTopic(); }, 5 * 60 * 1000);
        this._statusBar.show();
        this._columnBar.show();
    }

    public waitToFetch(){
        this._statusBar.text = '获取热点新闻中' + '.'.repeat(this._repeat);
        this._statusBar.command = 'trendingTopic.openInBrowser';
        this._repeat = (this._repeat+1) % 5;
    }

    public updateStatusBar() {
        let items: Array<any> | undefined = this._topics.get(this._column);
        if (items !== undefined) {
            this._index = (this._index + 1) % Math.min(this._topN, items.length);
            this._statusBar.text = `${this._index+1}. ${items[this._index].title}`;
            this._columnBar.text = `${this._column.slice(0, 2)}`;
            this._statusBar.show();
            this._columnBar.show();
        }
    }

    public fetchTrendingTopic() {
        const pattern = "#main > .mainBody > div > table > tbody > tr > td.keyword > a.list-title";
        sitemap.map(async (site) => {
            let response = await axios.get(site.url, { responseType: 'arraybuffer' });
            // let ctype: string = response.headers["content-type"];
            // let data;
            // if (ctype.includes("charset=GB2312")){
                // data = iconv.decode(response.data, 'gb2312');
            // }
            // else {
                // data = iconv.decode(response.data, 'utf-8');
            // }
            let $ = await cheerio.load(response.data, { decodeEntities: false });
            let items: Array<any> = [];
            $(pattern).map((idx, item) => {
                let url = $(item).attr("href");
                let title = $(item).text();
                items.push({ title, url });
            });
            this._topics.set(site.column, items);
            if (site.column === this._column) {
                clearInterval(this._update_timer);
                this.updateStatusBar();
                this._update_timer = setInterval(() => { this.updateStatusBar(); }, 5 * 1000);
            }
        });
    }

    public async changeColumn() {
        let selected = await vscode.window.showQuickPick(this._pickitems);
        if ( selected !== undefined && selected.label !== this._column) {
            this._column = selected.label;
            this._index = -1;
            clearInterval(this._update_timer);
            this.updateStatusBar();
            this._update_timer = setInterval(() => this.updateStatusBar(), 5 * 1000);
        }
    }

    public async openInBrowser() {
        let items: Array<any> | undefined = this._topics.get(this._column);
        if (items !== undefined) {
            let url: string = items[this._index].url;
            await cp.exec(`open '${url}'`);
        }
    }

    dispose() {
        this._statusBar.dispose();
        this._columnBar.dispose();
    }
}