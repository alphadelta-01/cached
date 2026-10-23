function getTimePrecision(value = appState.currentUser?.timePrecision) {
  return value === 'second' ? 'second' : 'minute';
}

function formatTime(value, precision = getTimePrecision()) {
  if (!value) return '';
  const date = value instanceof Date
    ? value
    : new Date(
      typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d/.test(value)
        ? `${value.replace(' ', 'T')}Z`
        : value
    );
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: precision === 'second' ? '2-digit' : undefined
  });
}

function updateRenderedTimes(container, precision) {
  container.querySelectorAll('time[data-timestamp]').forEach((time) => {
    time.textContent = formatTime(time.dataset.timestamp, precision);
  });
}

function appendFormattedText(container, value) {
  if (value.startsWith('\u2063')) {
    const parsed = new DOMParser().parseFromString(value.slice(1), 'text/html');
    const allowedTags = new Set(['STRONG', 'EM', 'U', 'S', 'BR']);
    function appendSafeMarkup(parent, source) {
      for (const node of source.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          parent.append(document.createTextNode(node.textContent));
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          if (!allowedTags.has(node.tagName)) {
            appendSafeMarkup(parent, node);
            continue;
          }
          const element = document.createElement(node.tagName.toLowerCase());
          appendSafeMarkup(element, node);
          parent.append(element);
        }
      }
    }
    appendSafeMarkup(container, parsed.body);
    return;
  }

  const pattern = /\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*([\s\S]+?)\*/g;
  let cursor = 0;
  let match = pattern.exec(value);
  while (match) {
    container.append(document.createTextNode(value.slice(cursor, match.index)));
    const tagName = match[1] !== undefined
      ? 'strong'
      : match[2] !== undefined
        ? 'u'
        : match[3] !== undefined
          ? 's'
          : 'em';
    const formatted = document.createElement(tagName);
    appendFormattedText(formatted, match[1] ?? match[2] ?? match[3] ?? match[4]);
    container.append(formatted);
    cursor = pattern.lastIndex;
    match = pattern.exec(value);
  }
  container.append(document.createTextNode(value.slice(cursor)));
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

function createUnreadBadge(unreadCount) {
  if (!unreadCount) return null;
  const badge = document.createElement('span');
  badge.className = 'unread-badge';
  badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
  badge.setAttribute('aria-label', `${unreadCount} unread messages`);
  return badge;
}

function updateConversationItem(item, conversation, currentUserId) {
  const button = item.querySelector('.dialog-item');
  button.dataset.conversationId = String(conversation.id);
  button.classList.toggle(
    'selected',
    appState.currentConversation?.id === conversation.id
  );
  button.classList.toggle('has-unread', Boolean(conversation.unreadCount));

  const nameLine = button.querySelector('.dialog-name-line');
  nameLine.querySelector('strong').textContent = conversation.otherUser.displayName;
  const currentBadge = nameLine.querySelector('.unread-badge');
  const unreadBadge = createUnreadBadge(conversation.unreadCount);
  if (currentBadge) currentBadge.remove();
  if (unreadBadge) nameLine.insertBefore(unreadBadge, nameLine.querySelector('time'));

  const time = nameLine.querySelector('time');
  time.dataset.timestamp = conversation.lastMessage?.createdAt instanceof Date
    ? conversation.lastMessage.createdAt.toISOString()
    : conversation.lastMessage?.createdAt || '';
  time.textContent = formatTime(
    conversation.lastMessage?.createdAt,
    getTimePrecision(appState.currentUser?.timePrecision)
  );
  const lastMessage = conversation.lastMessage;
  const isOwnLastMessage = lastMessage?.senderId === currentUserId;
  const preview = button.querySelector('.dialog-preview');
  preview.replaceChildren();
  if (lastMessage) {
    if (isOwnLastMessage) preview.append(document.createTextNode('You: '));
    appendFormattedText(preview, lastMessage.text);
  } else {
    preview.textContent = 'Send the first message';
  }
}

function createConversationItem(conversation, currentUserId, onSelect) {
  const item = document.createElement('li');
  item.className = 'dialog-row';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dialog-item';
  const nameLine = document.createElement('span');
  nameLine.className = 'dialog-name-line';
  const name = document.createElement('strong');
  const time = document.createElement('time');
  nameLine.append(name, time);
  const preview = document.createElement('span');
  preview.className = 'dialog-preview';
  button.append(nameLine, preview);
  button.addEventListener('click', () => onSelect(conversation));
  item.append(button);
  updateConversationItem(item, conversation, currentUserId);
  return item;
}

function upsertConversation(container, conversation, currentUserId, onSelect, moveToTop = false) {
  let item = [...container.querySelectorAll('.dialog-row')].find(
    (row) => row.querySelector('.dialog-item').dataset.conversationId
      === String(conversation.id)
  );
  if (!item) {
    if (!conversation.lastMessage) return;
    container.querySelector('.empty-list-message')?.remove();
    item = createConversationItem(conversation, currentUserId, onSelect);
    container.prepend(item);
  } else {
    updateConversationItem(item, conversation, currentUserId);
    if (moveToTop) container.prepend(item);
  }
}

function selectConversationItem(container, conversationId) {
  container.querySelectorAll('.dialog-item[data-conversation-id]').forEach((button) => {
    button.classList.toggle(
      'selected',
      String(conversationId) === button.dataset.conversationId
    );
  });
}

function renderConversations(container, conversations, currentUserId, onSelect) {
  container.replaceChildren();
  if (!conversations.length) {
    container.append(createEmptyItem('No chats yet.'));
    return;
  }

  for (const conversation of conversations) {
    container.append(createConversationItem(conversation, currentUserId, onSelect));
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
    button.dataset.userId = String(user.id);
    if (appState.currentConversation?.otherUser.id === user.id) {
      button.classList.add('selected');
    }
    const name = document.createElement('strong');
    name.textContent = user.displayName;
    const username = document.createElement('span');
    username.className = 'dialog-username';
    username.textContent = `@${user.username} · ID ${user.id}`;
    const nameLine = document.createElement('span');
    nameLine.className = 'dialog-name-line';
    nameLine.append(name);
    const identityLine = document.createElement('span');
    identityLine.className = 'search-result-identity';
    identityLine.append(username);
    const unreadBadge = createUnreadBadge(user.unreadCount);
    if (unreadBadge) {
      button.classList.add('has-unread');
      identityLine.append(unreadBadge);
    }
    button.append(nameLine, identityLine);
    button.addEventListener('click', () => onSelect(user));
    item.append(button);
    container.append(item);
  }
}

function updateSearchResultUnread(container, userId, unreadCount) {
  const button = [...container.querySelectorAll('.search-result')].find(
    (result) => result.dataset.userId === String(userId)
  );
  if (!button) return;

  const identityLine = button.querySelector('.search-result-identity');
  const currentBadge = identityLine.querySelector('.unread-badge');
  const unreadBadge = createUnreadBadge(unreadCount);
  if (currentBadge) currentBadge.remove();
  if (unreadBadge) identityLine.append(unreadBadge);
  button.classList.toggle('has-unread', Boolean(unreadCount));
}

function createMessageItem(message, currentUserId) {
  const item = document.createElement('li');
  const own = message.senderId === currentUserId;
  const color = own
    ? appState.currentUser.messageColor
    : message.messageColor;
  item.className = own ? 'message own-message' : 'message other-message';
  item.dataset.messageId = String(message.id);
  item.style.setProperty('--message-background-color', color);
  item.style.setProperty('--message-foreground-color', foregroundFor(color));

  const text = document.createElement('span');
  text.className = 'message-text';
  appendFormattedText(text, message.text);

  if (message.replyTo) {
    const reply = document.createElement('button');
    reply.type = 'button';
    reply.className = 'message-reply-quote';
    reply.dataset.replyToId = String(message.replyTo.id);
    reply.setAttribute('aria-label', `Go to message from ${message.replyTo.senderDisplayName}`);
    const replySender = document.createElement('strong');
    replySender.textContent = message.replyTo.senderId === currentUserId
      ? 'You'
      : message.replyTo.senderDisplayName;
    const replyText = document.createElement('span');
    appendFormattedText(replyText, message.replyTo.text);
    reply.append(replySender, replyText);
    item.append(reply);
  }

  if (message.forwardedFrom) {
    const forwarded = document.createElement('span');
    forwarded.className = 'message-forwarded-label';
    forwarded.textContent = `Forwarded from ${message.forwardedFrom}`;
    item.append(forwarded);
  }

  const time = document.createElement('time');
  time.className = 'message-time';
  time.dataset.timestamp = message.createdAt instanceof Date
    ? message.createdAt.toISOString()
    : message.createdAt || '';
  time.textContent = formatTime(message.createdAt, getTimePrecision(appState.currentUser?.timePrecision));

  const status = document.createElement('span');
  status.className = 'message-status';
  status.hidden = !message.sending;
  status.textContent = 'Sending…';

  if (!own) {
    const sender = document.createElement('button');
    sender.type = 'button';
    sender.className = 'message-sender';
    sender.textContent = message.senderDisplayName;
    sender.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('profile:open', {
        detail: { userId: message.senderId }
      }));
    });
    item.append(sender);
  }
  item.append(text, time);
  if (own) item.append(status);
  return item;
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
    container.append(createMessageItem(message, currentUserId));
  }
}

function appendRenderedMessage(container, message, currentUserId) {
  const messageId = String(message.id);
  if (container.querySelector(`[data-message-id="${messageId}"]`)) return;

  const wasAtBottom = container.scrollHeight - container.scrollTop
    - container.clientHeight < 40;
  container.querySelector('.empty-conversation')?.remove();
  const item = createMessageItem(message, currentUserId);
  const nextMessage = [...container.querySelectorAll('[data-message-id]')].find(
    (existing) => Number(existing.dataset.messageId) > message.id
  );
  container.insertBefore(item, nextMessage || null);
  if (wasAtBottom) container.scrollTop = container.scrollHeight;
}

function updateMessagePreview(element, color) {
  element.style.setProperty('--message-background-color', color);
  element.style.setProperty('--message-foreground-color', foregroundFor(color));
}
