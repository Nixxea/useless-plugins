import { registerCommand } from '@vendetta/commands';
import { findByProps } from '@vendetta/metro';

const Messages = findByProps('sendBotMessage');
const Moderation = findByProps('setCommunicationDisabledUntil');
const UserStore = findByProps('getUsers');
const PermissionStore = findByProps('canManageUser');
const canTimeout = findByProps('canToggleCommunicationDisableOnUser').canToggleCommunicationDisableOnUser;
const saveChannel = findByProps('saveChannel').saveChannel;

const Permissions = findByProps('Permissions').Permissions;
const { ApplicationCommandOptionType, ApplicationCommandType } = findByProps('ApplicationCommandOptionType');

const MAX_TIMEOUT_TIME = 2419200000;
const MAX_SLOWMODE_TIME = 21600;

const timeTriggers = {
    с: 1000,
    м: 60000,
    ч: 3600000,
    д: 86400000,
    н: 604800000,
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000,
    w: 604800000
};

function parseTime(text) {
    let time = 0;
    const matches = text.matchAll(/((?:\d+\.)?\d+) ?([^\d\s.]+)/g);

    for (const match of matches) {
        const [, value, unit] = match;

        let modifier;
        for (const modifierName in timeTriggers) {
            if (unit.startsWith(modifierName)) {
                modifier = timeTriggers[modifierName];
                break;
            }
        }

        if (!modifier) continue;
        time += modifier * value;
    }

    return time || null;
}
function parseDate(text) {
    // date format is russian only
    const matched = text.match(/^(?:(\d{1,2})\.(\d{1,2})(?:\.(\d{1,4}))?)?(?:(?:\s|-| в | in )?(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
    if (!matched || !matched[0]) return null;

    const now = new Date();
    const target = new Date(1970, 0);
    let [, day, month, year, hour, minute, second] = matched;

    target.setFullYear(+year || now.getFullYear());
    target.setMonth(+month ? month - 1 : now.getMonth());
    target.setDate(+day || now.getDate());

    if (hour) {
        target.setHours(+hour);
        target.setMinutes(+minute);
        target.setSeconds(+second || 0);
    }

    return target;
}

function getTime(text) {
    const parsedTime = parseTime(text);
    if (parsedTime) return parsedTime;

    const parsedDate = parseDate(text);
    if (parsedDate) return parsedDate.getTime() - Date.now();

    return null;
}

export default {
    commands: [],
    onLoad() {
        this.registerCommand({
            name: 'mute',
            displayName: 'mute',
            description: 'Time out member.',
            displayDescription: 'Time out member.',
            applicationId: '-1',
            options: [
                {
                    name: 'member',
                    displayName: 'member',
                    description: 'The member to time out',
                    displayDescription: 'The member to time out',
                    required: true,
                    type: ApplicationCommandOptionType.USER
                },
                {
                    name: 'time',
                    displayName: 'time',
                    description: 'Time out time or date',
                    displayDescription: 'Time out time or date',
                    required: true,
                    type: ApplicationCommandOptionType.STRING
                },
                {
                    name: 'reason',
                    displayName: 'reason',
                    description: 'The reason for time out',
                    displayDescription: 'The reason for time out',
                    required: false,
                    type: ApplicationCommandOptionType.STRING
                }
            ],
            type: 1,
            inputType: 1,
            predicate(ctx) {
                return PermissionStore.can(Permissions.MODERATE_MEMBERS, ctx.guild);
            },
            async execute(args, ctx) {
                const userId = args.find(a => a.name === 'member').value;
                const timeString = args.find(a => a.name === 'time').value;
                const reason = args.find(a => a.name === 'reason')?.value;

                const user = UserStore.getUser(userId);

                if (!canTimeout(ctx.guild.id, userId)) return Messages.sendBotMessage(ctx.channel.id, 'You cannot time out this member.');

                let time = getTime(timeString);
                if (!time) return Messages.sendBotMessage(ctx.channel.id, `Seems like \`${timeString}\` is not a valid time string.\nFor example: \`1h30m\` or \`1hour 10m\``);

                time = Math.min(MAX_TIMEOUT_TIME, time);
                const timestamp = Date.now() + time;
                const unixTimestamp = timestamp / 1000 | 0;

                Moderation.setCommunicationDisabledUntil({
                    guildId: ctx.guild.id,
                    userId,
                    communicationDisabledUntilTimestamp: new Date(Date.now() + time).toISOString(),
                    reason
                });

                const replyText = `**${(user.discriminator === '0' ? user.username : user.tag) || userId}** has been timed out for <t:${unixTimestamp}:R>, <t:${unixTimestamp}:d> <t:${unixTimestamp}:T>`;
                Messages.sendBotMessage(ctx.channel.id, replyText);
            }
        });

        this.registerCommand({
            name: 'slowmode',
            displayName: 'slowmode',
            description: 'Set slowmode on the channel.',
            displayDescription: 'Set slowmode on the channel.',
            options: [
                {
                    name: 'time',
                    displayName: 'time',
                    description: 'Time out time or date',
                    displayDescription: 'Time out time or date',
                    required: true,
                    type: ApplicationCommandOptionType.STRING
                },
                {
                    name: 'channel',
                    displayName: 'channel',
                    description: 'The reason for time out',
                    displayDescription: 'The reason for time out',
                    required: false,
                    type: ApplicationCommandOptionType.CHANNEL
                }
            ],
            type: ApplicationCommandType.CHAT,
            predicate(ctx) {
                return PermissionStore.can(Permissions.MANAGE_CHANNELS, ctx.channel);
            },
            async execute(args, ctx) {
                const channelId = args.find(a => a.name === 'channel')?.value || ctx.channel.id;
                const timeString = args.find(a => a.name === 'time').value;

                let time = parseTime(timeString) / 1000 | 0;
                if (typeof time !== 'number') return Messages.sendBotMessage(ctx.channel.id, `Seems like \`${timeString}\` is not a valid time string.\nFor example: \`1h30m\` or \`1hour 10m\``);
                time = Math.min(MAX_SLOWMODE_TIME, time);

                saveChannel(channelId, { rateLimitPerUser: time });

                const replyText = `Slowmode for the channel has been set to \`${time}\` seconds.`;
                Messages.sendBotMessage(ctx.channel.id, replyText);
            }
        });
    },

    onUnload() {
        for (const unload of this.commands) {
            unload();
        }

        this.commnads = [];
    },

    registerCommand(command) {
        this.commands.push(registerCommand(command));
    }
};