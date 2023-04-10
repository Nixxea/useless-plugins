import { registerCommand } from '@vendetta/commands';
import { findByProps } from '@vendetta/metro';

const Messages = findByProps('sendBotMessage');
const Moderation = findByProps('setCommunicationDisabledUntil');
const UserStore = findByProps('getUsers');
const PermissionStore = findByProps('canManageUser');
const canTimeout = findByProps('canToggleCommunicationDisableOnUser').canToggleCommunicationDisableOnUser;

const names = {
    years: ['год', 'года', 'лет'],
    days: ['день', 'дня', 'дней'],
    hours: ['час', 'часа', 'часов'],
    minutes: ['минуту', 'минуты', 'минут'],
    seconds: ['секунду', 'секунды', 'секунд']
};

const timeTriggers = {
    мес: 2592000000,
    mo: 2592000000,
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

function parseMs(ms) {
    const round = ms > 0 ? Math.floor : Math.ceil;

    return {
        years: round(ms / 31536000000),
        days: round(ms / 86400000) % 365,
        hours: round(ms / 3600000) % 24,
        minutes: round(ms / 60000) % 60,
        seconds: round(ms / 1000) % 60
    };
}

function plural(array, n, insertNumber = false) {
    n = +n;
    const word = array[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2];
    return insertNumber ? `${n} ${word}` : word;
}

function formatTime(ms, d = 2) {
    return Object.entries(parseMs(ms)).filter(d => d[1]).slice(0, d).map(d => plural(names[d[0]], d[1], true)).join(' ');
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
            description: 'Отправляет подумать о своем поведении.',
            displayDescription: 'Отправляет подумать о своем поведении.',
            applicationId: '-1',
            options: [
                {
                    name: 'участник',
                    displayName: 'участник',
                    description: 'Участник, которого нужно отправить подумать о своем поведении',
                    displayDescription: 'Участник, которого нужно отправить подумать о своем поведении',
                    required: true,
                    type: 6
                },
                {
                    name: 'время',
                    displayName: 'время',
                    description: 'Время молчания',
                    displayDescription: 'Время молчания',
                    required: true,
                    type: 3
                },
                {
                    name: 'причина',
                    displayName: 'причина',
                    description: 'Причина подумать о своем поведении',
                    displayDescription: 'Причина подумать о своем поведении',
                    required: false,
                    type: 3
                }
            ],
            type: 1,
            inputType: 1,
            predicate(ctx) {
                return PermissionStore.can(1n << 40n, ctx.guild);
            },
            async execute(args, ctx) {
                const userId = args.find(a => a.name === 'участник').value;
                const timeString = args.find(a => a.name === 'время').value;
                const reason = args.find(a => a.name === 'причина')?.value;

                const user = UserStore.getUser(userId);
                const time = getTime(timeString);

                if (!time) return Messages.sendBotMessage(ctx.channel.id, 'Не удалось разобрать время тайм-аута');
                if (!canTimeout(ctx.guild.id, userId)) return Messages.sendBotMessage(ctx.channel.id, 'Вы не можете выдавать тайм-аут этому пользователю');

                Moderation.setCommunicationDisabledUntil(ctx.guild.id, userId, new Date(Date.now() + time).toISOString(), null, reason);

                const replyText = `**${user?.tag || userId}** был отправлен подумать о своем поведении на \`${formatTime(time)}\``;
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
        this.commands.push(registerCommand(command))
    }
}