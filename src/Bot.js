import Discord from 'discord.js'
import Nightmare from 'nightmare'
import XLSX from 'xlsx'

import path from 'path'

const nightmare = Nightmare({
  show: true,
  openDevTools: {
    mode: 'detach'
  }
})

const readChannelId = '313398928890527746'
const writeChannelId = '345179574033842177'
const xlsxUrl = 'https://onedrive.live.com/view.aspx?resid=B92275A9BF72C170!40986&ithint=file%2cxlsx&app=Excel&authkey=!AJDJRXahXJTfaUU'

export default class Bot {
  constructor (botToken) {
    this.main = this.main.bind(this)

    this.botToken = botToken

    this.client = new Discord.Client()
    this.client.on("ready", async () => {
      this.client.user.setGame('live countdowns until payout')
      this.readChannel = this.client.channels.get(readChannelId)
      this.writeChannel = this.client.channels.get(writeChannelId)

      this.initializeBot()
      console.log('Bot initialized')
    })

    this.client.login(botToken)

    // scrape Excel online
    // TODO not working right now, nightmare is unable to find elements by selectors
    // await this.scrapeXlsx()
    // TODO workaround: parse local xlsx file
    this.sheet = XLSX.utils.sheet_to_json(XLSX.readFile(path.resolve(__dirname, '../SWGoH_Shard.xlsx')).Sheets.Sheet1)

    this.parseXlsx()

    this.main()
  }

  async main () {
    try {
      if (this.message) {
        this.calculateSecondsUntilPayout()
        await this.sendMessage()
      }
    } catch (err) {} finally {
      setTimeout(this.main, 30000)
    }
  }

  async initializeBot () {
    // fetch message. create a new one if necessary
    const messages = await this.writeChannel.fetchMessages()
    if (messages.array().length === 0) {
      this.message = await this.writeChannel.send('Time until next payout:\n')
    } else {
      this.message = messages.first()
    }
  }

  async scrapeXlsx () {
    try {
      // TODO oh my god, please let me scrape you, Excel online
      nightmare.goto(xlsxUrl)
        .wait(5000)
        .evaluate(() => {
          // console.log(document.querySelector('#m_excelWebRenderer_ewaCtl_commandUIPlaceHolder'))
          return document.querySelector('body')
        })
        .end()
        .then(res => {
          console.log(res)
        })
    } catch (err) {
      console.error(err)
    }
  }

  parseXlsx () {
    this.mates = []
    for (let i in this.sheet) {
      const user = this.sheet[i]
      this.mates.push({
        name: user.Name,
        payout: parseInt(user.UTC.substr(0,2)),
        discordId: user.ID,
        flag: user.Flag,
        swgoh: user.SWGOH
      })
    }
    const matesByTime = {}
    for (let i in this.mates) {
      const mate = this.mates[i]
      if (!matesByTime[mate.payout]) {
        matesByTime[mate.payout] = {
          payout: mate.payout,
          mates: []
        }
      }
      matesByTime[mate.payout].mates.push(mate)
    }
    this.mates = Object.values(matesByTime)
  }

  calculateSecondsUntilPayout () {
    const now = new Date()
    for (let i in this.mates) {
      const mate = this.mates[i]
      const p = new Date()
      p.setUTCHours(mate.payout, 0, 0, 0)
      if (p < now) p.setDate(p.getDate() + 1)
      mate.timeUntilPayout = p.getTime() - now.getTime()
      const dif = new Date(mate.timeUntilPayout + 60000)
      mate.time = `${String(dif.getUTCHours()).padStart(2, '00')}:${String(dif.getUTCMinutes()).padStart(2, '00')}`
    }
    this.mates.sort((a, b) => {
      return a.timeUntilPayout - b.timeUntilPayout
    })
  }

  async sendMessage () {
    let message = 'Time until next payout:\n'
    for (let i in this.mates) {
      message += `\n\`${this.mates[i].time}\`\n`
      for (let j in this.mates[i].mates) {
        const mate = this.mates[i].mates[j]
        message += `${mate.flag} ${mate.name} - ${mate.swgoh}\n`
      }
    }
    await this.message.edit(message)
  }
}