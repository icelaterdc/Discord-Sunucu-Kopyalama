const fetch = require('node-fetch')
const delay = require('delay')
const cliProgress = require('cli-progress')

async function fetchBuffer(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Icon fetch failed: ${res.status}`)
  return await res.buffer()
}

module.exports.cloneGuild = async (client, config) => {
  const src = client.guilds.get(config.sourceGuildId)
  const tgt = client.guilds.get(config.targetGuildId)
  if (!src || !tgt) throw new Error('Kaynak veya hedef sunucu bulunamadı.')

  if (config.resetTargetServer) {
    for (const ch of tgt.channels.values()) {
      let attempts = 0
      while (attempts < 2) {
        try {
          await client.deleteChannel(ch.id)
          break
        } catch {
          attempts++
          await delay(config.rateLimitDelay)
        }
      }
      if (attempts === 2) console.error(`Silme atlandı: Kanal "${ch.name || ch.id}"`)
      await delay(config.rateLimitDelay)
    }
    
    for (const r of tgt.roles.values()) {
      if (r.id === tgt.id) continue
      let attempts = 0
      while (attempts < 2) {
        try {
          await client.deleteRole(tgt.id, r.id)
          break
        } catch {
          attempts++
          await delay(config.rateLimitDelay)
        }
      }
      if (attempts === 2) console.error(`Silme atlandı: Rol "${r.name}" renk:${r.color}`)
      await delay(config.rateLimitDelay)
    }

    for (const emoji of tgt.emojis.values()) {
      let attempts = 0
      while (attempts < 2) {
        try {
          await client.deleteGuildEmoji(tgt.id, emoji.id)
          break
        } catch {
          attempts++
          await delay(config.rateLimitDelay)
        }
      }
      if (attempts === 2) console.error(`Silme atlandı: Emoji "${emoji.name}"`)
      await delay(config.rateLimitDelay)
    }
  }

  const everyoneRole = src.roles.get(src.id)
  const everyoneRoleData = {
    permissions: typeof everyoneRole.permissions === 'bigint' ? Number(everyoneRole.permissions) : 
                typeof everyoneRole.permissions === 'string' ? parseInt(everyoneRole.permissions) :
                everyoneRole.permissions
  }

  const rolesData = Array.from(src.roles.values())
    .filter(r => r.id !== src.id)
    .sort((a, b) => b.position - a.position) 
    .map(r => ({
      id: r.id,
      name: r.name,
      color: r.color,
      hoist: r.hoist,
      permissions: typeof r.permissions === 'bigint' ? Number(r.permissions) : 
                  typeof r.permissions === 'string' ? parseInt(r.permissions) :
                  r.permissions,
      mentionable: r.mentionable,
      position: r.position
    }))

  const categoriesData = Array.from(src.channels.values())
    .filter(c => c.type === 4)
    .sort((a, b) => a.position - b.position)
    .map(c => ({
      id: c.id,
      name: c.name,
      overwrites: c.permissionOverwrites.map(o => ({ 
        id: o.id, 
        type: o.type,
        allow: typeof o.allow === 'bigint' ? Number(o.allow) : 
               typeof o.allow === 'string' ? parseInt(o.allow) : o.allow, 
        deny: typeof o.deny === 'bigint' ? Number(o.deny) : 
              typeof o.deny === 'string' ? parseInt(o.deny) : o.deny
      })),
      position: c.position
    }))

  const channelsData = Array.from(src.channels.values())
    .filter(c => c.type !== 4)
    .sort((a, b) => a.position - b.position)
    .map(c => ({
      id: c.id,
      name: c.name,
      type: c.type === 5 ? 0 : c.type,
      topic: c.topic,
      nsfw: c.nsfw,
      bitrate: c.bitrate,
      userLimit: c.userLimit,
      rateLimitPerUser: c.rateLimitPerUser || 0,
      overwrites: c.permissionOverwrites.map(o => ({ 
        id: o.id, 
        type: o.type,
        allow: typeof o.allow === 'bigint' ? Number(o.allow) : 
               typeof o.allow === 'string' ? parseInt(o.allow) : o.allow, 
        deny: typeof o.deny === 'bigint' ? Number(o.deny) : 
              typeof o.deny === 'string' ? parseInt(o.deny) : o.deny
      })),
      parentID: c.parentID,
      position: c.position
    }))

  const emojisData = Array.from(src.emojis.values()).map(e => ({
    id: e.id,
    name: e.name,
    url: e.url,
    animated: e.animated,
    roles: e.roles ? Array.from(e.roles) : []
  }))

  const totalSteps = 2 + rolesData.length + categoriesData.length + channelsData.length + emojisData.length
  const bar = new cliProgress.SingleBar({ 
    format: 'Progress |{bar}| {percentage}% || {value}/{total} adım' 
  }, cliProgress.Presets.shades_classic)
  bar.start(totalSteps, 0)

  let lastUpdate = Date.now()
  const stallTimeout = 10000
  const watchdog = setInterval(() => {
    if (Date.now() - lastUpdate > stallTimeout) {
      console.warn('⚠️ İşlem takıldı, yeniden deneniyor…')
      lastUpdate = Date.now()
    }
  }, stallTimeout)

  let serverAttempts = 0
  while (serverAttempts < 2) {
    try {
      const editData = { 
        name: src.name
      }
      
      if (src.description) editData.description = src.description
      if (src.iconURL) {
        const iconBuffer = await fetchBuffer(src.iconURL)
        editData.icon = `data:image/png;base64,${iconBuffer.toString('base64')}`
      }
      if (src.bannerURL) {
        const bannerBuffer = await fetchBuffer(src.bannerURL)
        editData.banner = `data:image/png;base64,${bannerBuffer.toString('base64')}`
      }
      if (src.splashURL) {
        const splashBuffer = await fetchBuffer(src.splashURL)
        editData.splash = `data:image/png;base64,${splashBuffer.toString('base64')}`
      }
      
      if (src.verificationLevel !== undefined) editData.verificationLevel = src.verificationLevel
      if (src.defaultMessageNotifications !== undefined) editData.defaultMessageNotifications = src.defaultMessageNotifications
      if (src.explicitContentFilter !== undefined) editData.explicitContentFilter = src.explicitContentFilter
      if (src.afkChannelID) editData.afkChannelID = src.afkChannelID
      if (src.afkTimeout) editData.afkTimeout = src.afkTimeout
      if (src.systemChannelID) editData.systemChannelID = src.systemChannelID
      
      await client.editGuild(tgt.id, editData)
      break
    } catch (e) {
      serverAttempts++
      console.log(`Sunucu ayarları hatası (deneme ${serverAttempts}):`, e.message)
      await delay(config.rateLimitDelay)
    }
  }
  if (serverAttempts === 2) console.error(`Atlandı: Sunucu ayarları güncellenemedi "${src.name}"`)
  bar.increment()
  lastUpdate = Date.now()

  let everyoneAttempts = 0
  while (everyoneAttempts < 2) {
    try {
      await client.editRole(tgt.id, tgt.id, { permissions: everyoneRoleData.permissions })
      break
    } catch (e) {
      everyoneAttempts++
      console.log(`Everyone rol hatası (deneme ${everyoneAttempts}):`, e.message)
      await delay(config.rateLimitDelay)
    }
  }
  if (everyoneAttempts === 2) console.error('Atlandı: Everyone rolü izinleri güncellenemedi')
  bar.increment()
  lastUpdate = Date.now()

  const roleMap = new Map()
  roleMap.set(src.id, tgt.id) 
  
  for (const r of rolesData) {
    let role = null
    let tries = 0
    while (tries < 2) {
      try {
        role = await client.createRole(tgt.id, { 
          name: r.name, 
          color: r.color, 
          hoist: r.hoist, 
          permissions: r.permissions, 
          mentionable: r.mentionable 
        })
        break
      } catch (e) {
        tries++
        console.log(`Rol oluşturma hatası "${r.name}" (deneme ${tries}):`, e.message)
        await delay(config.rateLimitDelay)
      }
    }
    if (!role) {
      console.error(`Atlandı: Rol oluşturulamadı "${r.name}"`)
    } else {
      roleMap.set(r.id, role.id)
    }
    bar.increment()
    lastUpdate = Date.now()
    await delay(config.rateLimitDelay)
  }

  const categoryMap = new Map()
  for (const c of categoriesData) {
    let channel = null
    let tries = 0
    while (tries < 2) {
      try {
        const mappedOverwrites = c.overwrites.map(o => ({
          id: roleMap.get(o.id) || o.id,
          type: o.type,
          allow: o.allow,
          deny: o.deny
        }))
        
        channel = await client.createChannel(tgt.id, c.name, 4, { 
          permissionOverwrites: mappedOverwrites 
        })
        break
      } catch (e) {
        tries++
        console.log(`Kategori oluşturma hatası "${c.name}" (deneme ${tries}):`, e.message)
        await delay(config.rateLimitDelay)
      }
    }
    if (!channel) {
      console.error(`Atlandı: Kategori oluşturulamadı "${c.name}"`)
    } else {
      categoryMap.set(c.id, channel.id)
    }
    bar.increment()
    lastUpdate = Date.now()
    await delay(config.rateLimitDelay)
  }

  const channelMap = new Map()
  for (const c of channelsData) {
    let channel = null
    let tries = 0
    while (tries < 2) {
      try {
        const mappedOverwrites = c.overwrites.map(o => ({
          id: roleMap.get(o.id) || o.id,
          type: o.type,
          allow: o.allow,
          deny: o.deny
        }))

        const channelOptions = {
          permissionOverwrites: mappedOverwrites,
          topic: c.topic,
          nsfw: c.nsfw,
          parentID: c.parentID ? categoryMap.get(c.parentID) : undefined
        }

        if (c.type === 2) {
          if (c.bitrate) channelOptions.bitrate = c.bitrate
          if (c.userLimit) channelOptions.userLimit = c.userLimit
        }

        if (c.type === 0) {
          if (c.rateLimitPerUser) channelOptions.rateLimitPerUser = c.rateLimitPerUser
        }

        channel = await client.createChannel(tgt.id, c.name, c.type, channelOptions)
        break
      } catch (e) {
        tries++
        console.log(`Kanal oluşturma hatası "${c.name}" (deneme ${tries}):`, e.message)
        await delay(config.rateLimitDelay)
      }
    }
    if (!channel) {
      console.error(`Atlandı: Kanal oluşturulamadı "${c.name}"`)
    } else {
      channelMap.set(c.id, channel.id)
    }
    bar.increment()
    lastUpdate = Date.now()
    await delay(config.rateLimitDelay)
  }

  for (const e of emojisData) {
    let emoji = null
    let tries = 0
    while (tries < 2) {
      try {
        const emojiBuffer = await fetchBuffer(e.url)
        const mappedRoles = e.roles.map(roleId => roleMap.get(roleId)).filter(Boolean)
        
        emoji = await client.createGuildEmoji(tgt.id, {
          name: e.name,
          image: `data:image/${e.animated ? 'gif' : 'png'};base64,${emojiBuffer.toString('base64')}`,
          roles: mappedRoles.length > 0 ? mappedRoles : undefined
        })
        break
      } catch (err) {
        tries++
        console.log(`Emoji oluşturma hatası "${e.name}" (deneme ${tries}):`, err.message)
        await delay(config.rateLimitDelay * 2) 
      }
    }
    if (!emoji) {
      console.error(`Atlandı: Emoji oluşturulamadı "${e.name}"`)
    }
    bar.increment()
    lastUpdate = Date.now()
    await delay(config.rateLimitDelay * 2)
  }

  clearInterval(watchdog)
  bar.stop()
  
  console.log('\n✅ Sunucu klonlama tamamlandı!')
  console.log(`📊 Özet:`)
  console.log(`   • ${rolesData.length} rol oluşturuldu`)
  console.log(`   • ${categoriesData.length} kategori oluşturuldu`) 
  console.log(`   • ${channelsData.length} kanal oluşturuldu`)
  console.log(`   • ${emojisData.length} emoji oluşturuldu`)
      }
