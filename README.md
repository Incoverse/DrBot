<a name="readme-top"></a>
<!--
*** This is the readme for the DrBot bot.
*** Credit to https://github.com/ROBERTGUO19 for making the original README for IRIS
-->

<br />
<div align="center">
  <a href="https://github.com/Incoverse/DrBot">
    <img src="https://i.imgur.com/IE8HTiM.png" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">DrBot (A Discord bot built for DrVem's Community)</h3>

  <p align="center">
    DrBot is a Discord bot that is focused on fun and utlities, as well as helping people understand TypeScript.
    <br />
    <hr>
  </p>
</div>



<!-- TABLE OF CONTENTS -->
<details open>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#server-creation-notes">Server Creation Notes</a></li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
  </ol>
</details>



<!-- ABOUT THE PROJECT -->
## About The Project

Welcome to the official repository for DrBot, a Discord bot focused on fun and utilities with the purpose of helping people understand TypeScript. The name DrBot comes from the streamer DrVem, whose community this was built for.

DrBot is coded from scratch and with :heart: by the DrVem Community!

### Built With

There are many frameworks/libraries used to create this project. Here are a few of them.

* [![Discord][Discord.js]][Discord-url]
* [![.ENV][dotenv]][dotenv-url]
* [![Express][express]][express-url]
* [![MongoDB][MongoDB]][MongoDB-url]
* [![chalk][chalk]][chalk-url]


<p align="right">(<a href="#readme-top">Go to the top</a>)</p>



<!-- GETTING STARTED -->
## Getting Started

Follow these steps to get a copy of DrBot up and running on your machine!

### Prerequisites

* [Node.JS](https://nodejs.org/en) (latest) 
* [git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
* [VSCode](https://code.visualstudio.com/download) (optional)
* [MongoDB Compass](https://www.mongodb.com/try/download/compass) (optional)

### Installation

1. Clone the repo
   ```sh
   git clone https://github.com/Incoverse/DrBot
   ```
2. Navigate to the project directory
   ```sh
   cd DrBot
   ```
4. Install TypeScript using npm
   ```sh
   npm i -g typescript
   ```
5. Create your MongoDB server.
   > This step is optional but recommended. If you wish to use file storage instead, skip to step 8.
   > 
   > If you wish to do it on your computer, follow [this guide (Windows)](https://www.prisma.io/dataguide/mongodb/setting-up-a-local-mongodb-database). For other operating systems, try googling about how to create a MongoDB server for that specific operating system. If done on the machine where DrBot will be running, your "mongoDBServer" in config.jsonc will be "localhost".
6. Create the following databases on your MongoDB server: (MongoDB Compass is recommended to do this in a much simpler way)
   - DrBot
   - DrBot_DEVELOPMENT
   
   > It will most likely force you to create a collection with the database, enter something temporary that you will delete later when DrBot is done with configurating the database
7. Create 2 users. 1 for production, and 1 for development
   ```
   use admin
   db.createUser({user:"drbot",pwd:"SomethingThatIsVerySecure", roles: [{role:"dbAdmin", db: "DrBot"},{role:"readWrite", db:"DrBot"}]})
   db.createUser({user:"drbotdev",pwd:"SomethingThatIsAlsoVerySecure", roles: [{role:"dbAdmin", db: "DrBot_DEVELOPMENT"},{role:"readWrite", db:"DrBot_DEVELOPMENT"}]})
   ```
   > It is recommended to keep the pre-set usernames as there is 1 internal check to make sure you don't run DrBot in production with development credentials and vice-versa
   > If you truly want to change the username, go [here](https://github.com/Incoverse/DrBot/blob/main/src/index.ts#L317) locally and edit the production username to your one.
8. Customize `config.jsonc` to your needs, check comments for guidance. 
9. Install any missing packages
   ```
   npm install
   ```
10. Create your discord bot.
    > Please note that the client ID, secret and token should **never** be committed to the repository
    - [Create a new Discord Application](https://discord.com/developers/applications)
    - Go to the `OAuth2` section and write down your client ID and secret
    - Staying on the same page, add the following redirect URI `http://localhost:7380` (Discord may add a slash at the end, make sure to remove it) 
    - Go to the `Bot` section and turn on all of the intents and write down your bot token (click 'Reset Token' to create the token)

11. Create a `.env` file in the project's root directory and replace the following values to the ones you've written down: `<bot-token>`, `<client-id>`, `<client-secret>`, `<MongoDB username>`, `<MongoDB password>`. Set DEVELOPMENT to YES or NO depending on what you want to do.

    ```
    TOKEN="<bot-token>"
    DBUSERNAME="<MongoDB username>" # Remove if using file storage
    DBPASSWD="<MongoDB password>" # Remove if using file storage
    DEVELOPMENT="<YES/NO>"
    cID="<client-id>"
    cSecret="<client-secret>"
    ```

12. Now it's time to add your bot to your server. Use the following URL, but replace `[client-id]` with the client ID you wrote down: https://discord.com/api/oauth2/authorize?client_id=[client-id]&permissions=328866327553&scope=bot%20applications.commands 
   > Follow <a href="#server-creation-notes">Server Creation Notes</a> to create your server.
13. Write `npm run CnR` in your cmd/terminal (CnR = Compile & Run) and click Enter.
14. When a link is displayed in the console, open it in your browser and authorize it. This will allow DrBot to properly set up command permissions (defined in `config.jsonc`).




<!-- Server Creation Notes -->
## Server Creation Notes

> **Note**: You can skip this by using the following server template: https://discord.new/b4vRrmwJB5kG 
---

The following channels are required for DrBot to function as intended: `birthdays`, `open-a-ticket`.

The following roles are required for DrBot to function as intended: `New Member`, `It's my birthday!`.




<!-- USAGE EXAMPLES -->
## Usage
Type '/' and all DrBot commands will show up

<p align="right">(<a href="#readme-top">Go to the top</a>)</p>



<!-- CONTRIBUTING -->
## Contributing

1. [Create a fork](https://docs.github.com/en/get-started/quickstart/fork-a-repo) of this repository
2. Clone the fork
   ```sh
   git clone https://github.com/YOUR_USERNAME/DrBot
   ```
3. Continue from step 3 in <a href="#installation">Installation</a>
4. Make changes
5. Submit a pull request! 





<!-- LICENSE -->
## License

Distributed under the GPL-3.0 license. See [LICENSE](https://github.com/Incoverse/DrBot/blob/main/LICENSE) for more information.




<!-- CONTACT -->
## Contact

For any questions or concerns, don't hesitate to contact Inimi **@theinimi** on Discord or via [email](mailto:contact@inimicalpart.com).

<hr>

<p align="center">(<a href="#readme-top">Go to the top</a>)</p>


<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[product-screenshot]: https://i.imgur.com/0Lp1rhn.png
[Discord.js]: https://img.shields.io/badge/-DiscordJS-5865F2?logo=Discord&logoColor=white
[Discord-url]: https://discord.js.org/
[dotenv]: https://img.shields.io/badge/-.ENV-ECD53F?logo=.env&logoColor=white
[dotenv-url]: https://www.dotenv.org/
[express]: https://img.shields.io/badge/-Express-000000?logo=Express&logoColor=white
[express-url]: https://expressjs.com/
[MongoDB]: https://img.shields.io/badge/-MongoDB-47A248?logo=MongoDB&logoColor=white
[MongoDB-url]: https://www.mongodb.com/
[chalk]: https://img.shields.io/badge/-chalk-CB3837?logo=npm&logoColor=white
[chalk-url]: https://www.npmjs.com/package/chalk
