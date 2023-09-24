import type { Channel, Guild, User } from "discord-types/general";
import type {
  AnyRepluggedCommand,
  CommandOptionReturn,
  CommandOptions,
  GetCommandOption,
  GetCommandOptions,
  GetValueType,
  RepluggedCommand,
  RepluggedCommandResult,
  RepluggedCommandSection,
} from "../../types";
import { ApplicationCommandOptionType } from "../../types";
import { constants, i18n, messages, users } from "../modules/common";
import type { Store } from "../modules/common/flux";
import { Logger } from "../modules/logger";
import { filters, getByStoreName, waitForModule } from "../modules/webpack";

const logger = Logger.api("Commands");

let RepluggedUser: User;

interface CommandsAndSection {
  section: RepluggedCommandSection;
  commands: Map<string, AnyRepluggedCommand>;
}

declare class UserClass implements User {
  public constructor(props: {
    avatar?: string;
    id: string;
    bot?: boolean;
    username?: string;
    system?: boolean;
  });
  public accentColor: number;
  public avatar: string;
  public banner: string;
  public bio: string;
  public bot: boolean;
  public desktop: boolean;
  public discriminator: string;
  public email: string | undefined;
  public flags: number;
  public guildMemberAvatars: Record<string, string>;
  public id: string;
  public mfaEnabled: boolean;
  public mobile: boolean;
  public nsfwAllowed: boolean | undefined;
  public phone: string | undefined;
  public premiumType: number | undefined;
  public premiumUsageFlags: number;
  public publicFlags: number;
  public purchasedFlags: number;
  public system: boolean;
  public username: string;
  public verified: boolean;
  public get createdAt(): Date;
  public get hasPremiumPerks(): boolean;
  public get tag(): string;
  public get usernameNormalized(): string;
  public addGuildAvatarHash(guildId: string, avatarHash: string): User;
  public getAvatarSource(guildId: string, canAnimate?: boolean | undefined): { uri: string };
  public getAvatarURL(
    guildId?: string | undefined,
    t?: unknown,
    canAnimate?: boolean | undefined,
  ): string;
  public hasAvatarForGuild(guildId: string): boolean;
  public hasDisabledPremium(): boolean;
  public hasFlag(flag: number): boolean;
  public hasFreePremium(): boolean;
  public hasHadSKU(e: unknown): boolean;
  public hasPremiumUsageFlag(flag: number): boolean;
  public hasPurchasedFlag(flag: number): boolean;
  public hasUrgentMessages(): boolean;
  public isClaimed(): boolean;
  public isLocalBot(): boolean;
  public isNonUserBot(): boolean;
  public isPhoneVerified(): boolean;
  public isStaff(): boolean;
  public isSystemUser(): boolean;
  public isVerifiedBot(): boolean;
  public removeGuildAvatarHash(guildId: string): User;
  public toString(): string;
}

void waitForModule(filters.bySource(".isStaffPersonal=")).then((User) => {
  RepluggedUser = new (User as typeof UserClass)({
    avatar: "replugged",
    id: "replugged",
    bot: true,
    username: "Replugged",
    system: true,
  });
});

export const commandAndSections = new Map<string, CommandsAndSection>();

export const defaultSection: RepluggedCommandSection = Object.freeze({
  id: "replugged",
  name: "Replugged",
  type: 1,
  icon: "https://cdn.discordapp.com/attachments/1000955992068079716/1004196106055454820/Replugged-Logo.png",
});

export class CommandInteraction<T extends CommandOptionReturn> {
  public options: T[];
  public channel: Channel;
  public guild: Guild;
  public constructor(props: { options: T[]; channel: Channel; guild: Guild }) {
    const UploadAttachmentStore = getByStoreName<
      Store & {
        getUpload: (
          channelId: string,
          optionName: string,
          draftType: 0,
        ) => { uploadedFilename?: string; item?: { file: File } };
      }
    >("UploadAttachmentStore")!;
    this.options = props.options;
    this.channel = props.channel;
    this.guild = props.guild;
    for (const option of this.options.filter(
      (o) => o.type === ApplicationCommandOptionType.Attachment,
    )) {
      const { uploadedFilename, item } =
        UploadAttachmentStore.getUpload(props.channel.id, option.name, 0) ?? {};
      option.value = { uploadedFilename, file: item?.file };
    }
  }

  public getValue<K extends T["name"], D = undefined>(
    name: K,
    defaultValue?: D,
  ): GetValueType<GetCommandOption<T, K>, D> {
    return (this.options.find((o) => o.name === name)?.value ?? defaultValue) as GetValueType<
      GetCommandOption<T, K>,
      D
    >;
  }
}

/**
 * @internal
 * @hidden
 */
async function executeCommand<T extends CommandOptions>(
  cmdExecutor:
    | ((
        interaction: CommandInteraction<GetCommandOptions<T>>,
      ) => Promise<RepluggedCommandResult> | RepluggedCommandResult)
    | undefined,
  args: Array<GetCommandOptions<T>>,
  currentInfo: { guild: Guild; channel: Channel },
  command: RepluggedCommand<T>,
): Promise<void> {
  try {
    const currentChannelId = currentInfo.channel.id;
    const loadingMessage = messages.createBotMessage({
      channelId: currentChannelId,
      content: "",
      loggingName: "Replugged",
    });

    Object.assign(loadingMessage, {
      flags: constants.MessageFlags.EPHEMERAL + constants.MessageFlags.LOADING, // adding loading too
      state: "SENDING", // Keep it a little faded
      interaction: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        name_localized: command.displayName,
        name: command.name,
        type: command.type,
        id: command.id,
        user: users.getCurrentUser(),
      },
      // eslint-disable-next-line @typescript-eslint/naming-convention
      interaction_data: {
        name: command.displayName,
      },
      type: 20,
      author: RepluggedUser ?? loadingMessage.author,
    });
    messages.receiveMessage(currentChannelId, loadingMessage, true);
    const interaction = new CommandInteraction({ options: args, ...currentInfo });
    const result = await cmdExecutor?.(interaction);
    messages.dismissAutomatedMessage(loadingMessage);

    if ((!result?.result && !result?.embeds) || !currentChannelId) return;

    if (result.send) {
      void messages.sendMessage(currentChannelId, {
        content: result.result!,
        invalidEmojis: [],
        validNonShortcutEmojis: [],
        tts: false,
      });
    } else {
      const botMessage = messages.createBotMessage({
        channelId: currentChannelId,
        content: result.result || "",
        embeds: result.embeds || [],
        loggingName: "Replugged",
      });

      Object.assign(botMessage, {
        interaction: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          name_localized: command.displayName,
          name: command.name,
          type: command.type,
          id: command.id,
          user: users.getCurrentUser(),
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        interaction_data: {
          name: command.displayName,
        },
        type: 20,
        author: RepluggedUser ?? botMessage.author,
      });
      messages.receiveMessage(currentChannelId, botMessage, true);
    }
  } catch (error) {
    logger.error(error);
    const currentChannelId = currentInfo.channel.id;
    const botMessage = messages.createBotMessage?.({
      channelId: currentChannelId,
      content: i18n.Messages.REPLUGGED_COMMAND_ERROR_GENERIC,
      embeds: [],
      loggingName: "Replugged",
    });
    if (!botMessage) return;

    Object.assign(botMessage, {
      interaction: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        name_localized: command.displayName,
        name: command.name,
        type: command.type,
        id: command.id,
        user: users.getCurrentUser(),
      },
      // eslint-disable-next-line @typescript-eslint/naming-convention
      interaction_data: {
        name: command.displayName,
      },
      type: 20,
      author: RepluggedUser ?? botMessage.author,
    });

    messages?.receiveMessage?.(currentChannelId, botMessage, true);
  }
}

export class CommandManager {
  #section: RepluggedCommandSection;
  #unregister: Array<() => void>;
  public constructor() {
    this.#section = defaultSection;
    this.#section.type ??= 1;
    this.#unregister = [];
  }

  /**
   * Code to register an slash command
   * @param cmd Slash Command to be registered
   * @returns An Callback to unregister the slash command
   */
  public registerCommand<const T extends CommandOptions>(command: RepluggedCommand<T>): () => void {
    if (!commandAndSections.has(this.#section.id)) {
      commandAndSections.set(this.#section.id, {
        section: this.#section,
        commands: new Map<string, AnyRepluggedCommand>(),
      });
    }
    const currentSection = commandAndSections.get(this.#section.id);
    command.applicationId = currentSection?.section.id;
    command.displayName ??= command.name;
    command.displayDescription ??= command.description;
    command.type = 2;
    command.id ??= command.name;

    command.execute ??= (args, currentInfo) => {
      void executeCommand(command.executor, args ?? [], currentInfo ?? {}, command);
    };
    const mapOptions = (option: T): T => {
      option.displayName ??= option.name;
      option.displayDescription ??= option.description;
      option.serverLocalizedName ??= option.displayName;
      if (
        option.type === ApplicationCommandOptionType.SubCommand ||
        option.type === ApplicationCommandOptionType.SubCommandGroup
      ) {
        option.applicationId = currentSection?.section.id;
        option.id ??= option.name;
        option.options.map(mapOptions);
      }
      if (option.type === ApplicationCommandOptionType.SubCommand) {
        option.execute ??= (args, currentInfo) => {
          void executeCommand(option.executor, args ?? [], currentInfo ?? {}, option);
        };
      }
      return option;
    };
    command.options?.map(mapOptions);

    currentSection?.commands.set(command.id, command as AnyRepluggedCommand);

    const uninject = (): void => {
      void currentSection?.commands.delete(command.id!);
      this.#unregister = this.#unregister.filter((u) => u !== uninject);
    };
    this.#unregister.push(uninject);
    return uninject;
  }
  /**
   * Code to unregister all slash commands registered with this class
   */
  public unregisterAllCommands(): void {
    for (const unregister of this.#unregister) unregister?.();
  }
}
