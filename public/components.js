const MESSAGE_COLORS = [
  '#2B2B2B',
  '#565656',
  '#848484',
  '#B3B3B3',
  '#E0E0E0'
];

function formatTime(value) {
  if (!value) return '';
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function foregroundFor(background) {
  const channels = background.slice(1).match(/.{2}/g).map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  const whiteContrast = 1.05 / (luminance + 0.05);
  const blackContrast = (luminance + 0.05) / 0.05;
  return whiteContrast >= blackContrast ? '#FFFFFF' : '#000000';
}

function createEmptyItem(text) {
  const item = document.createElement('li');
  item.className = 'empty-list-message';
  item.textContent = text;
  return item;
}

function renderConversations(container, conversations, currentUserId, onSelect) {
  container.replaceChildren();
  if (!conversations.length) {
    container.append(createEmptyItem('No chats yet.'));
    return;
  }

  for (const conversation of conversations) {
    const item = document.createElement('li');
    item.className = 'dialog-row';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dialog-item';
    if (appState.currentConversation?.id === conversation.id) {
      button.classList.add('selected');
    }

    const nameLine = document.createElement('span');
    nameLine.className = 'dialog-name-line';
    const name = document.createElement('strong');
    name.textContent = conversation.otherUser.displayName;
    const time = document.createElement('time');
    time.textContent = formatTime(conversation.lastMessage?.createdAt);
    nameLine.append(name, time);

    const preview = document.createElement('span');
    preview.className = 'dialog-preview';
    const lastMessage = conversation.lastMessage;
    const isOwnLastMessage = lastMessage?.senderId === currentUserId;
    preview.textContent = lastMessage
      ? `${isOwnLastMessage ? 'You: ' : ''}${lastMessage.text}`
      : 'Send the first message';
    button.append(nameLine, preview);
    button.addEventListener('click', () => onSelect(conversation));
    item.append(button);
    container.append(item);
  }
}

function renderSearchResults(container, users, onSelect) {
  container.replaceChildren();
  if (!users.length) {
    container.append(createEmptyItem('No users found.'));
    return;
  }

  for (const user of users) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dialog-item search-result';
    const name = document.createElement('strong');
    name.textContent = user.displayName;
    const username = document.createElement('span');
    username.className = 'dialog-username';
    username.textContent = `@${user.username} · ID ${user.id}`;
    button.append(name, username);
    button.addEventListener('click', () => onSelect(user));
    item.append(button);
    container.append(item);
  }
}

function renderMessages(container, messages, currentUserId) {
  container.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-conversation';
    empty.textContent = 'Send the first message.';
    container.append(empty);
    return;
  }

  for (const message of messages) {
    const item = document.createElement('li');
    const own = message.senderId === currentUserId;
    const color = own
      ? appState.currentUser.messageColor
      : message.messageColor;
    item.className = own ? 'message own-message' : 'message other-message';
    item.style.setProperty('--message-background-color', color);
    item.style.setProperty('--message-foreground-color', foregroundFor(color));

    const sender = document.createElement('span');
    sender.className = 'message-sender';
    sender.textContent = own ? 'You' : message.senderDisplayName;
    const text = document.createElement('span');
    text.className = 'message-text';
    text.textContent = message.text;
    const time = document.createElement('time');
    time.className = 'message-time';
    time.textContent = formatTime(message.createdAt);
    item.append(sender, text, time);
    container.append(item);
  }
}

function createColorPalette(container, selectedColor, onSelect) {
  container.replaceChildren();
  for (const color of MESSAGE_COLORS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'palette-color';
    button.style.backgroundColor = color;
    button.setAttribute('aria-label', `Select color ${color}`);
    button.setAttribute('aria-pressed', String(color === selectedColor));
    if (color === selectedColor) button.classList.add('selected');
    button.addEventListener('click', () => onSelect(color));
    container.append(button);
  }
}

function updateMessagePreview(element, color) {
  element.style.setProperty('--message-background-color', color);
  element.style.setProperty('--message-foreground-color', foregroundFor(color));
}
