
import * as fs from "fs";
import { BitlyClient } from 'bitly/dist/bitly';
const bitlyClient = new BitlyClient(JSON.parse(
    fs.readFileSync('.bitlyApiKey.json', 'utf8')).api_key);

export function shortenUrl(longUrl: string): Promise<any> {
    return new Promise((resolve) => {
        bitlyClient.shorten(longUrl).then((result: any) => {
            console.log(result.url);
            resolve(result.url);
        }).catch((error) => {
            console.log(error);
        });
    })
}
