const socket = io({ autoConnect: false });
const authWelcome = document.getElementById('auth-welcome');
const authPanel = document.getElementById('auth-panel');
const chatPanel = document.getElementById('chat-panel');
const authForm = document.getElementById('auth-form');
const authMessage = document.getElementById('auth-message');
const welcomeStatus = document.getElementById('welcome-status');
const authTitle = document.getElementById('auth-title');
const authSubmit = document.getElementById('auth-submit');
const authBack = document.getElementById('auth-back');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const signupNameForm = document.getElementById('signup-name-form');
const signupUsernameInput = document.getElementById('signup-username');
const signupPasswordForm = document.getElementById('signup-password-form');
const signupPasswordInput = document.getElementById('signup-password');
const signupPasswordConfirmationInput = document.getElementById('signup-password-confirmation');
const signupPasswordSubmit = document.getElementById('signup-password-submit');
const signupPhraseForm = document.getElementById('signup-phrase-form');
const recoveryWordsList = document.getElementById('recovery-words');
const signupPhraseContinue = document.getElementById('signup-phrase-continue');
const signupConfirmForm = document.getElementById('signup-confirm-form');
const recoveryChallengePrompt = document.getElementById('recovery-challenge-prompt');
const recoveryChallengeInputs = document.getElementById('recovery-challenge-inputs');
const signupConfirmSubmit = document.getElementById('signup-confirm-submit');
const recoveryStart = document.getElementById('recovery-start');
const recoveryForm = document.getElementById('recovery-form');
const recoveryUsernameInput = document.getElementById('recovery-username');
const recoveryPhraseInput = document.getElementById('recovery-phrase-input');
const recoveryPasswordInput = document.getElementById('recovery-password');
const recoveryPasswordConfirmationInput =
  document.getElementById('recovery-password-confirmation');
const recoverySubmit = document.getElementById('recovery-submit');
const dialogList = document.getElementById('dialog-list');
const searchResults = document.getElementById('search-results');
const searchForm = document.getElementById('search-form');
const searchQuery = document.getElementById('search-query');
const sidebarStatus = document.getElementById('sidebar-status');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsToggle = document.getElementById('settings-toggle');
const settingsProfileTab = document.getElementById('settings-profile-tab');
const settingsTimeTab = document.getElementById('settings-time-tab');
const settingsProfileSection = document.getElementById('settings-profile-section');
const settingsTimeSection = document.getElementById('settings-time-section');
const conversationView = document.getElementById('conversation-view');
const welcomeView = document.getElementById('welcome-view');
const conversationName = document.getElementById('conversation-name');
const conversationPresence = document.getElementById('conversation-presence');
const presenceLabel = document.getElementById('presence-label');
const conversationStatus = document.getElementById('conversation-status');
const messagesElement = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const composer = document.getElementById('composer');
const attachmentToggle = document.getElementById('attachment-toggle');
const attachmentMenu = document.getElementById('attachment-menu');
const chooseMediaButton = document.getElementById('choose-media');
const attachmentFileInput = document.getElementById('attachment-file');
const attachmentPreview = document.getElementById('attachment-preview');
const attachmentStatus = document.getElementById('attachment-status');
const openTenorButton = document.getElementById('open-tenor');
const tenorSearchPanel = document.getElementById('tenor-search-panel');
const tenorSearchInput = document.getElementById('tenor-search-input');
const tenorSearchButton = document.getElementById('tenor-search-button');
const tenorResults = document.getElementById('tenor-results');
const settingsForm = document.getElementById('settings-form');
const settingsStatus = document.getElementById('settings-status');
const saveToast = document.getElementById('save-toast');
const saveToastClose = document.getElementById('save-toast-close');
let saveToastTimeout;
const visibilityTimers = new WeakMap();
const closeAnimationDuration = 180;
const logoutConfirmation = document.getElementById('logout-confirmation');
const logoutStatus = document.getElementById('logout-status');
const logoutCancel = document.getElementById('logout-cancel');
const logoutConfirm = document.getElementById('logout-confirm');
const logoutDialogClose = document.getElementById('logout-dialog-close');
const deleteConfirmation = document.getElementById('delete-confirmation');
const deleteStatus = document.getElementById('delete-status');
const deleteConfirm = document.getElementById('delete-confirm');
const deleteCancel = document.getElementById('delete-cancel');
const deleteDialogClose = document.getElementById('delete-dialog-close');
const deleteScopeOptions = document.querySelectorAll('input[name="delete-scope"]');
const messageContextMenu = document.getElementById('message-context-menu');
let messageContextMenuCloseTimer;
const messageDeleteConfirmation = document.getElementById('message-delete-confirmation');
const messageDeleteStatus = document.getElementById('message-delete-status');
const messageDeleteConfirm = document.getElementById('message-delete-confirm');
const messageDeleteEveryoneOption = document.getElementById('message-delete-everyone-option');
const messageForwardOverlay = document.getElementById('message-forward-overlay');
const messageForwardList = document.getElementById('message-forward-list');
const messageForwardStatus = document.getElementById('message-forward-status');
const deleteConversationButton = document.getElementById('conversation-delete');
const chatActionsMenu = document.getElementById('chat-actions-menu');
const openDeleteConfirmation = document.getElementById('open-delete-confirmation');
const displayNameInput = document.getElementById('display-name');
const profileUsernameInput = document.getElementById('profile-username');
const profileBioInput = document.getElementById('profile-bio');
const showLastSeenInput = document.getElementById('show-last-seen');
const profileSummaryName = document.getElementById('profile-summary-name');
const profileSummaryUsername = document.getElementById('profile-summary-username');
const profileSummaryBio = document.getElementById('profile-summary-bio');
const profileOverlay = document.getElementById('profile-overlay');
const profileClose = document.getElementById('profile-close');
const publicProfileName = document.getElementById('public-profile-name');
const publicProfileIdentity = document.getElementById('public-profile-identity');
const publicProfileBio = document.getElementById('public-profile-bio');
const notificationStatus = document.getElementById('notification-status');
const notificationToggle = document.getElementById('notification-toggle');
const customColorInput = document.getElementById('custom-color');
const colorHexInput = document.getElementById('color-hex');
const timePrecisionInput = document.getElementById('time-precision');
const messagePreview = document.getElementById('message-preview');
const replyPreview = document.getElementById('reply-preview');
const replyPreviewSender = document.getElementById('reply-preview-sender');
const replyPreviewText = document.getElementById('reply-preview-text');
let authScreen = 'welcome';
let signupUsername = '';
let signupTicket = '';
let recoveryPhrase = '';
let recoveryChallengePositions = [];
let openedConversationRequest = 0;
let searchRequestId = 0;
let messages = [];
let onlineUserIds = new Set();
let replyTarget = null;
let contextMessage = null;
let formatSelection = null;
let selectedAttachments = [];
let attachmentUploadsPending = false;
let messageSendPending = false;
let forwardMessageTarget = null;
let deleteMessageTarget = null;
let pushRegistration;
let pushPublicKey;
let profileRequestId = 0;
let profileReturnFocus;

function setStatus(element, message = '', type = 'error') {
  element.textContent = message;
  element.classList.toggle('error', Boolean(message) && type === 'error');
}

function decodePushKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function updateNotificationControls(subscription) {
  const enabled = Boolean(subscription);
  notificationToggle.disabled = false;
  notificationToggle.textContent = enabled
    ? 'Disable notifications'
    : 'Enable notifications';
  setStatus(notificationStatus, enabled
    ? 'Message notifications are enabled on this device.'
    : 'Get new message alerts, including when the app is closed.', 'info');
}

async function initializePushNotifications() {
  notificationToggle.disabled = true;
  if (
    !window.isSecureContext ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    setStatus(notificationStatus, 'Push notifications are not supported here. Open the app over HTTPS in a supported browser.');
    return;
  }

  try {
    const config = await api.getPushConfig();
    pushPublicKey = config.publicKey;
    pushRegistration = await navigator.serviceWorker.register('/sw.js?v=3');
    const subscription = await pushRegistration.pushManager.getSubscription();
    if (subscription) {
      await api.savePushSubscription(subscription.toJSON());
    }
    if (Notification.permission === 'denied') {
      notificationToggle.disabled = true;
      setStatus(notificationStatus, 'Notifications are blocked by your browser. Allow them in browser settings to enable alerts.');
      return;
    }
    updateNotificationControls(subscription);
  } catch (error) {
    notificationToggle.disabled = true;
    setStatus(notificationStatus, error.message);
  }
}

notificationToggle.addEventListener('click', async () => {
  notificationToggle.disabled = true;
  try {
    let subscription = await pushRegistration.pushManager.getSubscription();
    if (subscription) {
      await api.deletePushSubscription(subscription.endpoint);
      await subscription.unsubscribe();
      updateNotificationControls(null);
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setStatus(notificationStatus, permission === 'denied'
        ? 'Notifications are blocked by your browser. Allow them in browser settings to enable alerts.'
        : 'Allow notifications in the browser prompt to receive message alerts.');
      return;
    }

    subscription = await pushRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodePushKey(pushPublicKey)
    });
    try {
      await api.savePushSubscription(subscription.toJSON());
    } catch (error) {
      await subscription.unsubscribe();
      throw error;
    }
    updateNotificationControls(subscription);
  } catch (error) {
    notificationToggle.disabled = false;
    setStatus(notificationStatus, error.message);
  }
});

async function openNotificationConversation() {
  const url = new URL(window.location.href);
  const rawId = url.searchParams.get('conversation');
  if (!rawId || !/^\d+$/.test(rawId)) return;
  const conversationId = Number(rawId);
  if (!Number.isSafeInteger(conversationId) || conversationId < 1) return;

  url.searchParams.delete('conversation');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  try {
    const result = await api.getConversations();
    appState.conversations = result.conversations;
    renderConversations(dialogList, result.conversations, appState.currentUser.id, openConversation);
    const conversation = result.conversations.find((item) => item.id === conversationId);
    if (conversation) {
      await openConversation(conversation);
    } else {
      setStatus(sidebarStatus, 'This conversation is no longer available.');
    }
  } catch (error) {
    setStatus(sidebarStatus, error.message);
  }
}

function showSaveToast() {
  clearTimeout(saveToastTimeout);
  saveToast.hidden = false;
  saveToast.classList.remove('visible');
  void saveToast.offsetWidth;
  saveToast.classList.add('visible');
  saveToastTimeout = setTimeout(() => {
    dismissSaveToast();
  }, 3000);
}

function dismissSaveToast() {
  clearTimeout(saveToastTimeout);
  saveToast.classList.remove('visible');
  saveToastTimeout = setTimeout(() => {
    saveToast.hidden = true;
  }, 180);
}

function setAnimatedVisibility(element, visible) {
  clearTimeout(visibilityTimers.get(element));
  visibilityTimers.delete(element);
  element.classList.remove('is-closing');

  if (visible) {
    element.hidden = false;
    return;
  }

  if (element.hidden) return;
  element.classList.add('is-closing');
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 0
    : closeAnimationDuration;
  visibilityTimers.set(element, setTimeout(() => {
    if (element.classList.contains('is-closing')) {
      element.hidden = true;
      element.classList.remove('is-closing');
    }
    visibilityTimers.delete(element);
  }, duration));
}

saveToastClose.addEventListener('click', dismissSaveToast);

function showLogin(message = '') {
  appState.currentUser = null;
  onlineUserIds.clear();
  appState.conversations = [];
  appState.currentConversation = null;
  socket.disconnect();
  setAnimatedVisibility(settingsOverlay, false);
  settingsToggle.setAttribute('aria-expanded', 'false');
  settingsToggle.classList.remove('active');
  chatPanel.hidden = true;
  clearSignupSecrets();
  clearRecoverySecrets();
  setAuthScreen('welcome');
  setStatus(welcomeStatus, message);
}

function clearSignupSecrets() {
  signupTicket = '';
  recoveryPhrase = '';
  recoveryChallengePositions = [];
  signupPasswordInput.value = '';
  signupPasswordConfirmationInput.value = '';
  recoveryWordsList.replaceChildren();
  recoveryChallengeInputs.replaceChildren();
}

function clearRecoverySecrets() {
  recoveryPhraseInput.value = '';
  recoveryPasswordInput.value = '';
  recoveryPasswordConfirmationInput.value = '';
}

function showWorkspace(user) {
  appState.currentUser = user;
  appState.currentConversation = null;
  authWelcome.hidden = true;
  authPanel.hidden = true;
  chatPanel.hidden = false;
  chatPanel.classList.remove('conversation-open');
  setStatus(authMessage);
  setStatus(sidebarStatus);
  setStatus(conversationStatus);
  setActiveView('dialogs');
  populateSettings(user);
  socket.connect();
  loadConversations();
  initializePushNotifications();
  openNotificationConversation();
}

function setAuthScreen(screen) {
  authScreen = screen;
  const isWelcome = screen === 'welcome';
  setAnimatedVisibility(authWelcome, isWelcome);
  setAnimatedVisibility(authPanel, !isWelcome);
  authForm.hidden = screen !== 'login';
  signupNameForm.hidden = screen !== 'signup-name';
  signupPasswordForm.hidden = screen !== 'signup-password';
  signupPhraseForm.hidden = screen !== 'signup-phrase';
  signupConfirmForm.hidden = screen !== 'signup-confirm';
  recoveryForm.hidden = screen !== 'recovery';
  recoveryStart.hidden = screen !== 'login';
  authTitle.textContent = screen === 'signup-name'
    ? 'What is your name?'
    : screen === 'signup-password'
      ? 'Create your password'
      : screen === 'signup-phrase'
        ? 'Save your recovery phrase'
        : screen === 'signup-confirm'
          ? 'Confirm your recovery phrase'
          : screen === 'recovery'
            ? 'Recover your account'
            : 'Log In';
  authBack.hidden = isWelcome;
  setStatus(authMessage);
}

async function loadConversations() {
  if (!appState.conversations.length) {
    dialogList.replaceChildren(createEmptyItem('Loading chats…'));
  }
  try {
    const result = await api.getConversations();
    appState.conversations = result.conversations;
    renderConversations(dialogList, result.conversations, appState.currentUser.id, openConversation);
  } catch (error) {
    if (!appState.conversations.length) dialogList.replaceChildren();
    setStatus(sidebarStatus, error.message);
  }
}

async function loadSearchResults() {
  const query = searchQuery.value.trim();
  if (!query || appState.activeView !== 'search') return;
  const requestId = ++searchRequestId;
  try {
    const result = await api.searchUsers(query);
    if (requestId !== searchRequestId || appState.activeView !== 'search') return;
    renderSearchResults(searchResults, result.users, openUser);
  } catch (error) {
    if (requestId === searchRequestId) setStatus(sidebarStatus, error.message);
  }
}

async function refreshConversation(conversationId) {
  try {
    const result = await api.getConversations();
    const conversation = result.conversations.find((item) => item.id === conversationId);
    if (!conversation) return;

    const existing = appState.conversations.find((item) => item.id === conversationId);
    if (existing) {
      Object.assign(existing, conversation);
    } else {
      appState.conversations.push(conversation);
    }
    upsertConversation(
      dialogList,
      existing || conversation,
      appState.currentUser.id,
      openConversation
    );
    updateSearchResultUnread(searchResults, conversation.otherUser.id, conversation.unreadCount);
  } catch (error) {
    setStatus(sidebarStatus, error.message);
  }
}

function updateConversationFromMessage(conversationId, message) {
  const conversation = appState.conversations.find((item) => item.id === conversationId);
  if (!conversation) {
    refreshConversation(conversationId);
    return false;
  }
  if (conversation.lastMessage && conversation.lastMessage.id >= message.id) return false;

  conversation.lastMessage = message;
  const isActiveAndVisible = appState.currentConversation?.id === conversationId
    && !document.hidden;
  if (message.senderId === appState.currentUser.id || isActiveAndVisible) {
    conversation.unreadCount = 0;
  } else {
    conversation.unreadCount += 1;
  }
  upsertConversation(dialogList, conversation, appState.currentUser.id, openConversation, true);
  updateSearchResultUnread(searchResults, conversation.otherUser.id, conversation.unreadCount);
  return true;
}

function renderCurrentMessages(scrollToBottom = true) {
  renderMessages(messagesElement, messages, appState.currentUser.id);
  if (scrollToBottom) messagesElement.scrollTop = messagesElement.scrollHeight;
}

function closeMessageContextMenu() {
  clearTimeout(messageContextMenuCloseTimer);
  if (!messageContextMenu.hidden) {
    messageContextMenu.classList.add('is-closing');
    messageContextMenuCloseTimer = setTimeout(() => {
      if (messageContextMenu.classList.contains('is-closing')) {
        messageContextMenu.hidden = true;
        messageContextMenu.classList.remove('is-closing', 'format-only');
      }
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : closeAnimationDuration);
  } else {
    messageContextMenu.classList.remove('is-closing', 'format-only');
  }
  contextMessage = null;
  formatSelection = null;
}

function positionMessageContextMenu(event) {
  clearTimeout(messageContextMenuCloseTimer);
  messageContextMenu.hidden = false;
  messageContextMenu.classList.remove('is-closing');
  const menuWidth = messageContextMenu.offsetWidth;
  const menuHeight = messageContextMenu.offsetHeight;
  messageContextMenu.style.left = `${Math.max(
    8,
    Math.min(event.clientX, window.innerWidth - menuWidth - 8)
  )}px`;
  messageContextMenu.style.top = `${Math.max(
    8,
    Math.min(event.clientY, window.innerHeight - menuHeight - 8)
  )}px`;
}

function openMessageContextMenu(message, event) {
  contextMessage = message;
  messageContextMenu.classList.remove('format-only');
  messageContextMenu.querySelectorAll('.message-action-context-item').forEach(
    (item) => { item.hidden = false; }
  );
  messageContextMenu.querySelectorAll('.message-format-context-item').forEach(
    (item) => { item.hidden = true; }
  );
  positionMessageContextMenu(event);
  document.getElementById('message-menu-reply').disabled = Boolean(message.sending);
  document.getElementById('message-menu-forward').disabled = Boolean(message.sending);
  document.getElementById('message-menu-delete').disabled = Boolean(message.sending);
}

function openFormatContextMenu(event) {
  const selection = window.getSelection();
  if (
    !selection
    || selection.isCollapsed
    || !messageInput.contains(selection.anchorNode)
    || !messageInput.contains(selection.focusNode)
  ) {
    return false;
  }

  formatSelection = selection.getRangeAt(0).cloneRange();
  updateFormatMenuState(formatSelection);
  contextMessage = null;
  messageContextMenu.classList.add('format-only');
  messageContextMenu.querySelectorAll('.message-action-context-item').forEach(
    (item) => { item.hidden = true; }
  );
  messageContextMenu.querySelectorAll('.message-format-context-item').forEach(
    (item) => { item.hidden = false; }
  );
  positionMessageContextMenu(event);
  return true;
}

function rangeHasFormat(range, tagName) {
  let hasText = false;
  let allTextFormatted = true;
  const walker = document.createTreeWalker(messageInput, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (range.intersectsNode(node) && node.textContent.length > 0) {
      hasText = true;
      let parent = node.parentElement;
      let formatted = false;
      while (parent && messageInput.contains(parent)) {
        if (parent.tagName === tagName) {
          formatted = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (!formatted) allTextFormatted = false;
    }
    node = walker.nextNode();
  }
  return hasText && allTextFormatted;
}

function unwrapFormat(fragment, tagName) {
  [...fragment.querySelectorAll(tagName.toLowerCase())].reverse().forEach((element) => {
    element.replaceWith(...element.childNodes);
  });
}

function insertSelectedFragment(range, fragment) {
  const first = fragment.firstChild;
  const last = fragment.lastChild;
  range.insertNode(fragment);
  selectInsertedFragment(range, first, last);
}

function selectInsertedFragment(range, first, last) {
  if (first && last) {
    range.setStartBefore(first);
    range.setEndAfter(last);
  }
}

function removeFormatFromRange(range, fragment, tagName) {
  const ancestors = [];
  let node = range.startContainer.nodeType === Node.TEXT_NODE
    ? range.startContainer.parentElement
    : range.startContainer;
  while (node && node !== messageInput) {
    if (
      node.nodeType === Node.ELEMENT_NODE
      && node.tagName === tagName
      && (node === range.endContainer || node.contains(range.endContainer))
    ) {
      ancestors.push(node);
    }
    node = node.parentElement;
  }

  unwrapFormat(fragment, tagName);
  if (!ancestors.length) {
    insertSelectedFragment(range, fragment);
    return;
  }

  for (let index = 0; index < ancestors.length; index += 1) {
    const ancestor = ancestors[index];
    if (!messageInput.contains(ancestor)) continue;
    if (index > 0) {
      fragment = range.extractContents();
      unwrapFormat(fragment, tagName);
    }
    const parent = ancestor.parentNode;
    const reference = ancestor.nextSibling;
    const suffixRange = document.createRange();
    suffixRange.setStart(range.startContainer, range.startOffset);
    if (ancestor.lastChild) {
      suffixRange.setEndAfter(ancestor.lastChild);
    } else {
      suffixRange.collapse(true);
    }
    const suffix = suffixRange.extractContents();
    range.setStart(suffixRange.startContainer, suffixRange.startOffset);
    range.collapse(true);

    if (!ancestor.textContent && !ancestor.querySelector('br')) ancestor.remove();
    const first = fragment.firstChild;
    const last = fragment.lastChild;
    parent.insertBefore(fragment, reference);
    selectInsertedFragment(range, first, last);
    if (suffix.hasChildNodes()) {
      const suffixWrapper = document.createElement(tagName.toLowerCase());
      suffixWrapper.append(suffix);
      parent.insertBefore(suffixWrapper, reference);
    }
  }
}

function updateFormatMenuState(range) {
  const tags = { '**': 'STRONG', '*': 'EM', '__': 'U', '~~': 'S' };
  messageContextMenu.querySelectorAll('.message-format-context-item').forEach((button) => {
    const active = rangeHasFormat(range, tags[button.dataset.format]);
    button.setAttribute('aria-checked', String(active));
    button.classList.toggle('format-active', active);
  });
}

function applyMessageFormat(marker) {
  if (!formatSelection) return;
  const tags = { '**': 'STRONG', '*': 'EM', '__': 'U', '~~': 'S' };
  const tagName = tags[marker];
  const disable = rangeHasFormat(formatSelection, tagName);
  const fragment = formatSelection.extractContents();
  if (disable) {
    formatSelection.collapse(true);
    removeFormatFromRange(formatSelection, fragment, tagName);
  } else {
    const wrapper = document.createElement(tagName.toLowerCase());
    wrapper.append(fragment);
    fragment.append(wrapper);
    insertSelectedFragment(formatSelection, fragment);
  }

  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(formatSelection);
  formatSelection = formatSelection.cloneRange();
  updateFormatMenuState(formatSelection);
  messageInput.focus();
}

function editorTextLength() {
  return messageInput.innerText.replace(/\r\n/g, '\n').replace(/\n$/, '').length;
}

function editorToMessageText() {
  const markers = {
    STRONG: ['<strong>', '</strong>'],
    B: ['<strong>', '</strong>'],
    EM: ['<em>', '</em>'],
    I: ['<em>', '</em>'],
    U: ['<u>', '</u>'],
    S: ['<s>', '</s>'],
    DEL: ['<s>', '</s>']
  };
  function serialize(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    if (node.tagName === 'BR') return '<br>';

    const content = serializeChildren(node);
    if (node.tagName === 'DIV' || node.tagName === 'P') return content;
    const marker = markers[node.tagName];
    return marker ? `${marker[0]}${content}${marker[1]}` : content;
  }

  function serializeChildren(parent) {
    let output = '';
    let previousWasBlock = false;
    for (const node of parent.childNodes) {
      const isBlock = node.nodeType === Node.ELEMENT_NODE
        && (node.tagName === 'DIV' || node.tagName === 'P');
      if (output && (isBlock || previousWasBlock) && !output.endsWith('<br>')) {
        output += '<br>';
      }
      output += serialize(node);
      previousWasBlock = isBlock;
    }
    return output;
  }

  return `\u2063${serializeChildren(messageInput)}`;
}

function closeAttachmentMenu() {
  attachmentMenu.hidden = true;
  attachmentToggle.setAttribute('aria-expanded', 'false');
  tenorSearchPanel.hidden = true;
  chooseMediaButton.hidden = false;
  openTenorButton.hidden = false;
}

function renderAttachmentPreview() {
  attachmentPreview.replaceChildren();
  attachmentPreview.hidden = selectedAttachments.length === 0;
  for (const attachment of selectedAttachments) {
    const chip = document.createElement('div');
    chip.className = 'attachment-preview-item';
    const label = document.createElement('span');
    label.textContent = attachment.name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'attachment-remove-button';
    remove.disabled = messageSendPending;
    remove.setAttribute('aria-label', `Remove ${attachment.name}`);
    remove.textContent = '×';
    remove.addEventListener('click', async () => {
      if (attachment.id) {
        try {
          await api.deleteAttachment(appState.currentConversation.id, attachment.id);
        } catch (error) {
          setStatus(attachmentStatus, error.message);
          return;
        }
      }
      selectedAttachments = selectedAttachments.filter((item) => item !== attachment);
      renderAttachmentPreview();
    });
    chip.append(label, remove);
    attachmentPreview.append(chip);
  }
}

async function discardSelectedAttachments(conversationId) {
  const stagedAttachments = selectedAttachments.filter((attachment) => attachment.id);
  selectedAttachments = [];
  renderAttachmentPreview();
  setStatus(attachmentStatus);
  if (!conversationId) return;
  for (const attachment of stagedAttachments) {
    try {
      await api.deleteAttachment(conversationId, attachment.id);
    } catch (error) {
      setStatus(sidebarStatus, error.message);
    }
  }
}

async function uploadSelectedFiles(files) {
  const conversation = appState.currentConversation;
  if (!conversation) return;
  const remaining = 5 - selectedAttachments.length;
  if (remaining <= 0) {
    setStatus(attachmentStatus, 'You can attach up to five files to a message.');
    return;
  }
  const filesToUpload = files.slice(0, remaining);
  if (files.length > remaining) {
    setStatus(attachmentStatus, 'Only five attachments can be sent in one message. Extra files were skipped.');
  } else {
    setStatus(attachmentStatus);
  }

  attachmentUploadsPending = true;
  attachmentToggle.disabled = true;
  try {
    for (const file of filesToUpload) {
      if (file.size > 25 * 1024 * 1024) {
        setStatus(attachmentStatus, `${file.name} is larger than the 25 MB limit.`);
        continue;
      }
      try {
        const result = await api.uploadAttachment(conversation.id, file);
        if (appState.currentConversation?.id !== conversation.id) {
          await api.deleteAttachment(conversation.id, result.attachment.id);
          continue;
        }
        selectedAttachments.push(result.attachment);
        renderAttachmentPreview();
      } catch (error) {
        setStatus(attachmentStatus, error.message);
      }
    }
  } finally {
    attachmentUploadsPending = false;
    attachmentToggle.disabled = false;
  }
}

async function searchTenorGifs() {
  const query = tenorSearchInput.value.trim();
  if (!query) {
    setStatus(attachmentStatus, 'Enter a search term for Tenor GIFs.');
    return;
  }
  tenorSearchButton.disabled = true;
  tenorResults.replaceChildren(createEmptyItem('Searching Tenor…'));
  setStatus(attachmentStatus);
  try {
    const { gifs } = await api.searchTenorGifs(query);
    tenorResults.replaceChildren();
    if (!gifs.length) {
      tenorResults.append(createEmptyItem('No GIFs found.'));
      return;
    }
    for (const gif of gifs) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'tenor-result';
      option.setAttribute('aria-label', `Add GIF: ${gif.title}`);
      const image = document.createElement('img');
      image.src = gif.preview;
      image.alt = gif.title;
      image.loading = 'lazy';
      option.append(image);
      option.addEventListener('click', () => {
        if (selectedAttachments.length >= 5) {
          setStatus(attachmentStatus, 'You can attach up to five files to a message.');
          return;
        }
        if (selectedAttachments.some((attachment) => attachment.url === gif.url)) return;
        selectedAttachments.push({
          name: gif.title || 'Tenor GIF',
          mimeType: 'image/gif',
          size: 0,
          url: gif.url,
          external: true
        });
        renderAttachmentPreview();
        closeAttachmentMenu();
        messageInput.focus();
      });
      tenorResults.append(option);
    }
  } catch (error) {
    tenorResults.replaceChildren();
    setStatus(attachmentStatus, error.message);
  } finally {
    tenorSearchButton.disabled = false;
  }
}

function removeMessageFromCurrentView(messageId) {
  messages = messages.filter((message) => message.id !== messageId);
  for (const message of messages) {
    if (message.replyTo?.id === messageId) message.replyTo = null;
  }
  if (replyTarget?.id === messageId) clearReplyTarget();
  if (contextMessage?.id === messageId) closeMessageContextMenu();
  renderCurrentMessages(false);
  loadConversations();
}

function closeMessageDeleteConfirmation() {
  setAnimatedVisibility(messageDeleteConfirmation, false);
  deleteMessageTarget = null;
}

function closeMessageForwardOverlay() {
  setAnimatedVisibility(messageForwardOverlay, false);
  forwardMessageTarget = null;
}

function openMessageForwardOverlay(message) {
  forwardMessageTarget = {
    conversationId: appState.currentConversation.id,
    messageId: message.id
  };
  messageForwardList.replaceChildren();
  const destinations = appState.conversations.filter(
    (conversation) => conversation.id !== appState.currentConversation.id
  );
  if (destinations.length === 0) {
    messageForwardList.append(createEmptyItem('No other chats available.'));
  } else {
    for (const conversation of destinations) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'message-forward-option';
      button.textContent = `${conversation.otherUser.displayName} (@${conversation.otherUser.username})`;
      button.addEventListener('click', async () => {
        if (!forwardMessageTarget) return;
        button.disabled = true;
        setStatus(messageForwardStatus);
        try {
          await api.forwardMessage(
            forwardMessageTarget.conversationId,
            forwardMessageTarget.messageId,
            conversation.id
          );
          closeMessageForwardOverlay();
        } catch (error) {
          setStatus(messageForwardStatus, error.message);
          button.disabled = false;
        }
      });
      item.append(button);
      messageForwardList.append(item);
    }
  }
  setStatus(messageForwardStatus);
  setAnimatedVisibility(messageForwardOverlay, true);
}

function appendMessage(message) {
  if (messages.some((existing) => existing.id === message.id)) return false;

  if (message.senderId === appState.currentUser.id) {
    const pendingIndex = messages.findIndex((existing) => (
      existing.sending &&
      existing.senderId === message.senderId &&
      existing.text === message.text
    ));
    if (pendingIndex >= 0) {
      messages.splice(pendingIndex, 1, message);
      messages.sort((left, right) => left.id - right.id);
      renderCurrentMessages();
      return true;
    }
  }

  messages.push(message);
  messages.sort((left, right) => left.id - right.id);
  appendRenderedMessage(messagesElement, message, appState.currentUser.id);
  return true;
}

function clearReplyTarget() {
  replyTarget = null;
  setAnimatedVisibility(replyPreview, false);
  replyPreviewSender.textContent = '';
  replyPreviewText.textContent = '';
}

function renderConversationPresence() {
  const otherUser = appState.currentConversation?.otherUser;
  if (!otherUser) {
    presenceLabel.textContent = '';
    conversationPresence.classList.remove('is-online');
    return;
  }

  const isOnline = otherUser.online || onlineUserIds.has(otherUser.id);
  conversationPresence.classList.toggle('is-online', isOnline);
  if (isOnline) {
    presenceLabel.textContent = 'Online';
  } else if (otherUser.lastSeenAt) {
    const lastSeen = new Date(otherUser.lastSeenAt);
    presenceLabel.textContent = Number.isNaN(lastSeen.getTime())
      ? 'Offline'
      : `Last seen ${lastSeen.toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short'
      })}`;
  } else {
    presenceLabel.textContent = 'Offline';
  }
}

function updatePresence({ userId, online, lastSeenAt }) {
  if (userId === appState.currentUser?.id) return;
  if (online) {
    onlineUserIds.add(userId);
  } else {
    onlineUserIds.delete(userId);
  }

  for (const conversation of appState.conversations) {
    if (conversation.otherUser.id !== userId) continue;
    conversation.otherUser.online = Boolean(online);
    conversation.otherUser.lastSeenAt = lastSeenAt || null;
  }
  if (appState.currentConversation?.otherUser.id === userId) {
    appState.currentConversation.otherUser.online = Boolean(online);
    appState.currentConversation.otherUser.lastSeenAt = lastSeenAt || null;
    renderConversationPresence();
  }
}

function setReplyTarget(message) {
  replyTarget = message;
  replyPreviewSender.textContent = message.senderId === appState.currentUser.id
    ? 'You'
    : message.senderDisplayName;
  replyPreviewText.replaceChildren();
  appendFormattedText(replyPreviewText, message.text);
  setAnimatedVisibility(replyPreview, true);
  messageInput.focus();
}

async function openConversation(conversation) {
  if (
    messageSendPending
    && appState.currentConversation?.id !== conversation.id
  ) {
    setStatus(sidebarStatus, 'Wait for the message to finish sending before switching chats.');
    return;
  }
  const requestId = ++openedConversationRequest;
  closeMessageContextMenu();
  if (appState.currentConversation?.id !== conversation.id && selectedAttachments.length) {
    await discardSelectedAttachments(appState.currentConversation?.id);
  }
  if (appState.currentConversation) {
    socket.emit('conversation:leave', appState.currentConversation.id);
  }
  appState.currentConversation = conversation;
  clearReplyTarget();
  messages = [];
  conversationName.textContent = conversation.otherUser.displayName;
  renderConversationPresence();
  setAnimatedVisibility(conversationView, true);
  welcomeView.hidden = true;
  chatPanel.classList.add('conversation-open');
  setStatus(conversationStatus);
  renderCurrentMessages(false);
  selectConversationItem(dialogList, conversation.id);

  socket.emit('conversation:join', conversation.id, (result) => {
    if (result && result.error && appState.currentConversation?.id === conversation.id) {
      setStatus(conversationStatus, result.error);
    }
  });

  try {
    messagesElement.replaceChildren(createEmptyItem('Loading messages…'));
    const result = await api.getMessages(conversation.id);
    if (requestId !== openedConversationRequest) return;
    messages = result.messages;
    setStatus(conversationStatus);
    renderCurrentMessages();
    conversation.unreadCount = 0;
    upsertConversation(dialogList, conversation, appState.currentUser.id, openConversation);
    updateSearchResultUnread(searchResults, conversation.otherUser.id, conversation.unreadCount);
  } catch (error) {
    if (requestId === openedConversationRequest) {
      messagesElement.replaceChildren();
      setStatus(conversationStatus, error.message);
    }
  }
}

async function openUser(user) {
  setStatus(sidebarStatus);
  try {
    const result = await api.openConversation(user.id);
    await loadConversations();
    let conversation = appState.conversations.find(
      (item) => item.id === result.conversationId
    );
    if (!conversation) {
      conversation = {
        id: result.conversationId,
        otherUser: result.otherUser || user,
        unreadCount: 0,
        lastMessage: null
      };
      appState.conversations.push(conversation);
    }
    if (conversation.otherUser.online) onlineUserIds.add(conversation.otherUser.id);
    else onlineUserIds.delete(conversation.otherUser.id);
    await openConversation(conversation);
    searchQuery.value = '';
    setActiveView('dialogs');
  } catch (error) {
    searchResults.replaceChildren();
    setStatus(sidebarStatus, error.message);
  }
}

function setActiveView(view, settingsSection = 'profile') {
  const wasSettingsOpen = !settingsOverlay.hidden;
  appState.activeView = view;
  document.querySelectorAll('.sidebar-view').forEach((section) => {
    section.hidden = section.id !== `${view}-view`;
  });
  setAnimatedVisibility(settingsOverlay, view === 'settings');
  settingsToggle.setAttribute('aria-expanded', String(view === 'settings'));
  settingsToggle.classList.toggle('active', view === 'settings');
  setStatus(sidebarStatus);
  if (view === 'settings') {
    selectSettingsSection(settingsSection);
    (settingsSection === 'time' ? timePrecisionInput : displayNameInput).focus();
  } else if (wasSettingsOpen) {
    settingsToggle.focus();
  }
}

function selectSettingsSection(section) {
  const profileSelected = section === 'profile';
  settingsProfileSection.hidden = !profileSelected;
  settingsTimeSection.hidden = profileSelected;
  settingsProfileTab.setAttribute('aria-pressed', String(profileSelected));
  settingsTimeTab.setAttribute('aria-pressed', String(!profileSelected));
}

function setColor(value) {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return;
  const color = value.toUpperCase();
  colorHexInput.value = color;
  customColorInput.value = color;
  updateMessagePreview(messagePreview, color);
}

function populateSettings(user) {
  displayNameInput.value = user.displayName;
  profileUsernameInput.value = user.username;
  profileBioInput.value = user.bio || '';
  profileSummaryName.textContent = user.displayName;
  profileSummaryUsername.textContent = `@${user.username}`;
  profileSummaryBio.textContent = user.bio || '';
  profileSummaryBio.hidden = !user.bio;
  timePrecisionInput.value = user.timePrecision === 'second' ? 'second' : 'minute';
  showLastSeenInput.checked = user.showLastSeen !== false;
  setColor(user.messageColor);
}

async function openProfile(userId) {
  const requestId = ++profileRequestId;
  profileReturnFocus = document.activeElement;
  publicProfileName.textContent = 'Loading profile…';
  publicProfileIdentity.textContent = '';
  publicProfileBio.textContent = '';
  publicProfileBio.hidden = true;
  setAnimatedVisibility(profileOverlay, true);
  profileClose.focus();
  try {
    const result = await api.getUserProfile(userId);
    if (requestId !== profileRequestId) return;
    publicProfileName.textContent = result.profile.displayName;
    publicProfileIdentity.textContent =
      `@${result.profile.username} · ID ${result.profile.id}`;
    publicProfileBio.textContent = result.profile.bio || '';
    publicProfileBio.hidden = !result.profile.bio;
  } catch (error) {
    if (requestId !== profileRequestId) return;
    publicProfileName.textContent = 'Profile unavailable';
    publicProfileBio.textContent = error.message;
    publicProfileBio.hidden = false;
  }
}

function closeProfile() {
  setAnimatedVisibility(profileOverlay, false);
  profileRequestId += 1;
  if (profileReturnFocus instanceof HTMLElement && profileReturnFocus.isConnected) {
    profileReturnFocus.focus();
  }
}

document.getElementById('welcome-login').addEventListener('click', () => {
  setStatus(welcomeStatus);
  setAuthScreen('login');
  usernameInput.focus();
});

document.getElementById('welcome-signup').addEventListener('click', () => {
  setStatus(welcomeStatus);
  setAuthScreen('signup-name');
  signupUsernameInput.focus();
});

authBack.addEventListener('click', () => {
  if (authScreen === 'signup-confirm') {
    setAuthScreen('signup-phrase');
    signupPhraseContinue.focus();
    return;
  }
  if (authScreen === 'signup-phrase') {
    clearSignupSecrets();
    setAuthScreen('signup-password');
    signupPasswordInput.focus();
    return;
  }
  if (authScreen === 'signup-password') {
    setAuthScreen('signup-name');
    signupUsernameInput.focus();
    return;
  }
  if (authScreen === 'recovery') {
    clearRecoverySecrets();
    setAuthScreen('login');
    usernameInput.focus();
    return;
  }
  setAuthScreen('welcome');
  setStatus(welcomeStatus);
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authSubmit.disabled = true;
  setStatus(authMessage);
  try {
    const result = await api.login(usernameInput.value.trim(), passwordInput.value);
    passwordInput.value = '';
    showWorkspace(result.user);
  } catch (error) {
    setStatus(authMessage, error.message);
  } finally {
    authSubmit.disabled = false;
  }
});

signupNameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  signupUsername = signupUsernameInput.value.trim();
  setStatus(authMessage);
  setAuthScreen('signup-password');
  signupPasswordInput.focus();
});

signupPasswordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(authMessage);
  if (signupPasswordInput.value !== signupPasswordConfirmationInput.value) {
    setStatus(authMessage, 'Passwords do not match.');
    signupPasswordConfirmationInput.focus();
    return;
  }

  signupPasswordSubmit.disabled = true;
  try {
    const result = await api.prepareRegistration(
      signupUsername,
      signupPasswordInput.value,
      signupUsername
    );
    signupTicket = result.ticket;
    recoveryPhrase = result.phrase;
    recoveryChallengePositions = result.challengePositions;
    recoveryWordsList.replaceChildren();
    result.phrase.split(' ').forEach((word, index) => {
      const item = document.createElement('li');
      const position = document.createElement('span');
      position.className = 'recovery-word-position';
      position.textContent = String(index + 1);
      const value = document.createElement('span');
      value.textContent = word;
      item.append(position, value);
      recoveryWordsList.append(item);
    });
    setAuthScreen('signup-phrase');
    signupPhraseContinue.focus();
  } catch (error) {
    setStatus(authMessage, error.message);
  } finally {
    signupPasswordSubmit.disabled = false;
  }
});

signupPhraseContinue.addEventListener('click', () => {
  recoveryChallengeInputs.replaceChildren();
  const positions = recoveryChallengePositions.map((position) => String(position));
  recoveryChallengePrompt.textContent =
    `Enter the words at positions ${positions.join(', ')} from your recovery phrase.`;
  for (const position of recoveryChallengePositions) {
    const field = document.createElement('div');
    field.className = 'recovery-challenge-field';
    const label = document.createElement('label');
    label.htmlFor = `recovery-word-${position}`;
    label.textContent = `Word ${position}`;
    const input = document.createElement('input');
    input.id = `recovery-word-${position}`;
    input.name = `word-${position}`;
    input.dataset.position = String(position);
    input.autocomplete = 'off';
    input.autocapitalize = 'none';
    input.spellcheck = false;
    input.required = true;
    field.append(label, input);
    recoveryChallengeInputs.append(field);
  }
  setAuthScreen('signup-confirm');
  recoveryChallengeInputs.querySelector('input').focus();
});

signupConfirmForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(authMessage);
  signupConfirmSubmit.disabled = true;
  const answers = [...recoveryChallengeInputs.querySelectorAll('input')].map((input) => ({
    position: Number(input.dataset.position),
    word: input.value.trim().toLowerCase()
  }));
  try {
    const result = await api.completeRegistration(signupTicket, answers);
    clearSignupSecrets();
    signupUsernameInput.value = '';
    signupUsername = '';
    recoveryWordsList.replaceChildren();
    showWorkspace(result.user);
  } catch (error) {
    setStatus(authMessage, error.message);
  } finally {
    signupConfirmSubmit.disabled = false;
  }
});

recoveryStart.addEventListener('click', () => {
  setStatus(authMessage);
  setAuthScreen('recovery');
  recoveryUsernameInput.value = usernameInput.value.trim();
  recoveryUsernameInput.focus();
});

recoveryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(authMessage);
  if (recoveryPasswordInput.value !== recoveryPasswordConfirmationInput.value) {
    setStatus(authMessage, 'Passwords do not match.');
    recoveryPasswordConfirmationInput.focus();
    return;
  }

  recoverySubmit.disabled = true;
  try {
    const result = await api.recover(
      recoveryUsernameInput.value.trim(),
      recoveryPhraseInput.value,
      recoveryPasswordInput.value
    );
    clearRecoverySecrets();
    showWorkspace(result.user);
  } catch (error) {
    setStatus(authMessage, error.message);
  } finally {
    recoverySubmit.disabled = false;
  }
});

function closeLogoutConfirmation() {
  setAnimatedVisibility(logoutConfirmation, false);
}

function closeDeleteConfirmation() {
  setAnimatedVisibility(deleteConfirmation, false);
}

function setChatActionsMenuOpen(open) {
  deleteConversationButton.setAttribute('aria-expanded', String(open));
  chatActionsMenu.setAttribute('aria-hidden', String(!open));
  chatActionsMenu.classList.toggle('open', open);
  openDeleteConfirmation.tabIndex = open ? 0 : -1;
}

function clearDeletedConversation(conversationId) {
  if (appState.currentConversation?.id !== conversationId) return;
  socket.emit('conversation:leave', conversationId);
  appState.currentConversation = null;
  clearReplyTarget();
  messages = [];
  openedConversationRequest += 1;
  setAnimatedVisibility(conversationView, false);
  welcomeView.hidden = false;
  chatPanel.classList.remove('conversation-open');
}

document.getElementById('logout').addEventListener('click', () => {
  setStatus(logoutStatus);
  setAnimatedVisibility(logoutConfirmation, true);
  logoutCancel.focus();
});

logoutCancel.addEventListener('click', closeLogoutConfirmation);
logoutDialogClose.addEventListener('click', closeLogoutConfirmation);
logoutConfirmation.addEventListener('click', (event) => {
  if (event.target === logoutConfirmation) closeLogoutConfirmation();
});
logoutConfirm.addEventListener('click', async () => {
  const button = logoutConfirm;
  button.disabled = true;
  try {
    await api.logout();
    closeLogoutConfirmation();
    showLogin();
  } catch (error) {
    setStatus(logoutStatus, error.message);
  } finally {
    button.disabled = false;
  }
});

deleteConversationButton.addEventListener('click', () => {
  const isOpen = deleteConversationButton.getAttribute('aria-expanded') === 'true';
  setChatActionsMenuOpen(!isOpen);
});

openDeleteConfirmation.addEventListener('click', () => {
  setChatActionsMenuOpen(false);
  setStatus(deleteStatus);
  document.querySelector('input[name="delete-scope"][value="self"]').checked = true;
  setAnimatedVisibility(deleteConfirmation, true);
  deleteCancel.focus();
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.chat-actions')) setChatActionsMenuOpen(false);
});

deleteCancel.addEventListener('click', closeDeleteConfirmation);
deleteDialogClose.addEventListener('click', closeDeleteConfirmation);
deleteConfirmation.addEventListener('click', (event) => {
  if (event.target === deleteConfirmation) closeDeleteConfirmation();
});

deleteConfirm.addEventListener('click', async () => {
  const conversation = appState.currentConversation;
  if (!conversation) return;

  const selectedScope = document.querySelector('input[name="delete-scope"]:checked');
  if (!selectedScope) {
    setStatus(deleteStatus, 'Choose who to delete this chat for.');
    return;
  }

  deleteConfirm.disabled = true;
  setStatus(deleteStatus);
  try {
    await api.deleteConversation(conversation.id, selectedScope.value);
    closeDeleteConfirmation();
    clearDeletedConversation(conversation.id);
    await loadConversations();
  } catch (error) {
    setStatus(deleteStatus, error.message);
  } finally {
    deleteConfirm.disabled = false;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  setChatActionsMenuOpen(false);
  if (!messageContextMenu.hidden) {
    closeMessageContextMenu();
    return;
  }
  if (!messageDeleteConfirmation.hidden) {
    closeMessageDeleteConfirmation();
    return;
  }
  if (!messageForwardOverlay.hidden) {
    closeMessageForwardOverlay();
    return;
  }
  if (!logoutConfirmation.hidden) {
    closeLogoutConfirmation();
    return;
  }
  if (!deleteConfirmation.hidden) {
    closeDeleteConfirmation();
    return;
  }
  if (!profileOverlay.hidden) {
    closeProfile();
    return;
  }
  if (!settingsOverlay.hidden) setActiveView('dialogs');
});

deleteScopeOptions.forEach((option) => {
  option.addEventListener('change', () => setStatus(deleteStatus));
});

settingsToggle.addEventListener('click', () => {
  const isOpen = settingsToggle.getAttribute('aria-expanded') === 'true';
  setActiveView(isOpen ? 'dialogs' : 'settings');
});
document.getElementById('settings-back').addEventListener('click', () => {
  setActiveView('dialogs');
});
settingsProfileTab.addEventListener('click', () => setActiveView('settings', 'profile'));
settingsTimeTab.addEventListener('click', () => setActiveView('settings', 'time'));
settingsOverlay.addEventListener('click', (event) => {
  if (event.target === settingsOverlay) setActiveView('dialogs');
});
profileClose.addEventListener('click', closeProfile);
profileOverlay.addEventListener('click', (event) => {
  if (event.target === profileOverlay) closeProfile();
});
document.addEventListener('profile:open', (event) => openProfile(event.detail.userId));
conversationName.addEventListener('click', () => {
  const userId = appState.currentConversation?.otherUser.id;
  if (userId) openProfile(userId);
});

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = searchQuery.value.trim();
  if (!query) {
    setStatus(sidebarStatus, 'Enter an ID, username, or display name.');
    return;
  }
  searchQuery.disabled = true;
  setStatus(sidebarStatus);
  setActiveView('search');
  searchResults.replaceChildren(createEmptyItem('Searching for users…'));
  await loadSearchResults();
  searchQuery.disabled = false;
});

searchQuery.addEventListener('input', () => {
  if (!searchQuery.value.trim() && appState.activeView === 'search') {
    searchRequestId += 1;
    searchResults.replaceChildren();
    setActiveView('dialogs');
  }
});

document.getElementById('back-button').addEventListener('click', async () => {
  if (messageSendPending) {
    setStatus(conversationStatus, 'Wait for the message to finish sending before leaving this chat.');
    return;
  }
  const previousConversationId = appState.currentConversation?.id;
  if (selectedAttachments.length) {
    await discardSelectedAttachments(previousConversationId);
  }
  if (appState.currentConversation) {
    socket.emit('conversation:leave', appState.currentConversation.id);
  }
  appState.currentConversation = null;
  clearReplyTarget();
  openedConversationRequest += 1;
  chatPanel.classList.remove('conversation-open');
  setAnimatedVisibility(conversationView, false);
  welcomeView.hidden = false;
  selectConversationItem(dialogList, null);
  setActiveView('dialogs');
});

composer.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = editorToMessageText();
  const conversation = appState.currentConversation;
  if (!conversation) return;
  if (attachmentUploadsPending) {
    setStatus(attachmentStatus, 'Wait for uploads to finish before sending.');
    return;
  }
  const attachments = selectedAttachments.slice();
  if (!messageInput.innerText.trim() && attachments.length === 0) return;
  if (editorTextLength() > 4000) {
    setStatus(conversationStatus, 'Messages must be 4,000 characters or fewer.');
    return;
  }
  const reply = replyTarget;
  sendButton.disabled = true;
  attachmentToggle.disabled = true;
  messageSendPending = true;
  renderAttachmentPreview();
  setStatus(conversationStatus);
  closeAttachmentMenu();
  const editorSnapshot = messageInput.cloneNode(true);

  const pendingMessage = {
    id: -Date.now(),
    senderId: appState.currentUser.id,
    senderDisplayName: 'You',
    text: messageInput.innerText.trim() ? text : '',
    attachments: attachments.map((attachment, index) => ({
      ...attachment,
      id: attachment.id || `tenor-${Date.now()}-${index}`
    })),
    createdAt: new Date().toISOString(),
    messageColor: appState.currentUser.messageColor,
    replyTo: reply
      ? {
        id: reply.id,
        text: reply.text,
        senderId: reply.senderId,
        senderDisplayName: reply.senderDisplayName
      }
      : null,
    sending: true
  };
  appendMessage(pendingMessage);
  messageInput.replaceChildren();

  try {
    const result = await api.sendMessage(
      conversation.id,
      pendingMessage.text,
      reply?.id || null,
      attachments.filter((attachment) => attachment.id).map((attachment) => attachment.id),
      attachments.filter((attachment) => attachment.external).map(
        ({ url }) => ({ url })
      )
    );
    const wasCurrent = appState.currentConversation?.id === conversation.id;
    const pendingIndex = messages.findIndex((message) => message.id === pendingMessage.id);
    if (pendingIndex >= 0) {
      messages.splice(pendingIndex, 1, result.message);
    } else if (
      wasCurrent &&
      !messages.some((message) => message.id === result.message.id)
    ) {
      messages.push(result.message);
    }
    if (wasCurrent) {
      messages.sort((left, right) => left.id - right.id);
      renderCurrentMessages();
    }
    updateConversationFromMessage(conversation.id, result.message);
    if (replyTarget?.id === reply?.id) clearReplyTarget();
    if (appState.currentConversation?.id === conversation.id) {
      selectedAttachments = [];
      renderAttachmentPreview();
      setStatus(attachmentStatus);
    }
  } catch (error) {
    if (
      appState.currentConversation?.id === conversation.id
      && !messageInput.innerText.trim()
    ) {
      messageInput.innerHTML = editorSnapshot.innerHTML;
    }
    const pendingIndex = messages.findIndex((message) => message.id === pendingMessage.id);
    if (pendingIndex >= 0) {
      messages.splice(pendingIndex, 1);
      renderCurrentMessages();
    }
    setStatus(conversationStatus, error.message);
  } finally {
    messageSendPending = false;
    renderAttachmentPreview();
    sendButton.disabled = false;
    attachmentToggle.disabled = false;
    messageInput.focus();
  }
});

attachmentToggle.addEventListener('click', () => {
  const open = attachmentMenu.hidden;
  attachmentMenu.hidden = !open;
  attachmentToggle.setAttribute('aria-expanded', String(open));
  if (open) closeMessageContextMenu();
});

chooseMediaButton.addEventListener('click', () => {
  closeAttachmentMenu();
  attachmentFileInput.click();
});

attachmentFileInput.addEventListener('change', () => {
  uploadSelectedFiles([...attachmentFileInput.files]);
  attachmentFileInput.value = '';
});

openTenorButton.addEventListener('click', () => {
  chooseMediaButton.hidden = true;
  openTenorButton.hidden = true;
  tenorSearchPanel.hidden = false;
  tenorSearchInput.focus();
});

tenorSearchButton.addEventListener('click', searchTenorGifs);
tenorSearchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    searchTenorGifs();
  }
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.message-input-area')) closeAttachmentMenu();
});

messageInput.addEventListener('contextmenu', (event) => {
  if (openFormatContextMenu(event)) event.preventDefault();
});

messageInput.addEventListener('beforeinput', (event) => {
  if (event.inputType.startsWith('delete')) return;
  const selection = window.getSelection();
  const selectedLength = selection && messageInput.contains(selection.anchorNode)
    ? selection.toString().length
    : 0;
  const insertedLength = event.inputType === 'insertParagraph'
    || event.inputType === 'insertLineBreak'
    ? 1
    : (event.data || '').length;
  if (editorTextLength() - selectedLength + insertedLength > 4000) {
    event.preventDefault();
  }
});

messageInput.addEventListener('paste', (event) => {
  event.preventDefault();
  const text = event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
  const selection = window.getSelection();
  if (!selection || !messageInput.contains(selection.anchorNode)) return;
  const range = selection.getRangeAt(0);
  if (editorTextLength() - selection.toString().length + text.length > 4000) {
    setStatus(conversationStatus, 'Messages must be 4,000 characters or fewer.');
    return;
  }
  range.deleteContents();
  const fragment = document.createDocumentFragment();
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (index > 0) fragment.append(document.createElement('br'));
    fragment.append(document.createTextNode(line));
  });
  range.insertNode(fragment);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  messageInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
});

messageInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey) return;
  event.preventDefault();
  composer.requestSubmit();
});

messageContextMenu.querySelectorAll('.message-format-context-item').forEach((button) => {
  button.addEventListener('click', () => applyMessageFormat(button.dataset.format));
});

document.addEventListener('message:reply', (event) => {
  const message = event.detail.message;
  if (messages.some((item) => item.id === message.id)) {
    setReplyTarget(message);
  }
});

messagesElement.addEventListener('contextmenu', (event) => {
  const messageElement = event.target.closest('.message[data-message-id]');
  if (!messageElement) return;
  const message = messages.find(
    (item) => String(item.id) === messageElement.dataset.messageId
  );
  if (!message) return;
  event.preventDefault();
  openMessageContextMenu(message, event);
});

document.getElementById('message-menu-reply').addEventListener('click', () => {
  if (contextMessage) setReplyTarget(contextMessage);
  closeMessageContextMenu();
});

document.getElementById('message-menu-forward').addEventListener('click', () => {
  const message = contextMessage;
  closeMessageContextMenu();
  if (message && appState.currentConversation) openMessageForwardOverlay(message);
});

document.getElementById('message-menu-delete').addEventListener('click', () => {
  if (!contextMessage || !appState.currentConversation) return;
  deleteMessageTarget = {
    conversationId: appState.currentConversation.id,
    messageId: contextMessage.id
  };
  const canDeleteForEveryone = contextMessage.senderId === appState.currentUser.id;
  messageDeleteEveryoneOption.disabled = !canDeleteForEveryone;
  messageDeleteEveryoneOption.closest('label').hidden = !canDeleteForEveryone;
  document.querySelector('input[name="message-delete-scope"][value="self"]').checked = true;
  closeMessageContextMenu();
  setStatus(messageDeleteStatus);
  setAnimatedVisibility(messageDeleteConfirmation, true);
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('#message-context-menu')) closeMessageContextMenu();
});

document.getElementById('message-delete-cancel').addEventListener(
  'click',
  closeMessageDeleteConfirmation
);
document.getElementById('message-delete-close').addEventListener(
  'click',
  closeMessageDeleteConfirmation
);
messageDeleteConfirmation.addEventListener('click', (event) => {
  if (event.target === messageDeleteConfirmation) closeMessageDeleteConfirmation();
});
messageDeleteConfirmation.querySelectorAll('input[name="message-delete-scope"]').forEach(
  (option) => option.addEventListener('change', () => setStatus(messageDeleteStatus))
);
messageDeleteConfirm.addEventListener('click', async () => {
  if (!deleteMessageTarget) return;
  const selectedScope = messageDeleteConfirmation.querySelector(
    'input[name="message-delete-scope"]:checked'
  );
  if (!selectedScope) {
    setStatus(messageDeleteStatus, 'Choose who to delete this message for.');
    return;
  }

  messageDeleteConfirm.disabled = true;
  setStatus(messageDeleteStatus);
  try {
    const target = deleteMessageTarget;
    await api.deleteMessage(target.conversationId, target.messageId, selectedScope.value);
    closeMessageDeleteConfirmation();
    removeMessageFromCurrentView(target.messageId);
  } catch (error) {
    setStatus(messageDeleteStatus, error.message);
  } finally {
    messageDeleteConfirm.disabled = false;
  }
});

document.getElementById('message-forward-cancel').addEventListener(
  'click',
  closeMessageForwardOverlay
);
document.getElementById('message-forward-close').addEventListener(
  'click',
  closeMessageForwardOverlay
);
messageForwardOverlay.addEventListener('click', (event) => {
  if (event.target === messageForwardOverlay) closeMessageForwardOverlay();
});

document.getElementById('reply-cancel').addEventListener('click', clearReplyTarget);

messagesElement.addEventListener('click', (event) => {
  const quote = event.target.closest('.message-reply-quote');
  if (!quote) return;
  const quotedMessage = messagesElement.querySelector(
    `[data-message-id="${quote.dataset.replyToId}"]`
  );
  if (!quotedMessage) return;
  quotedMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  quotedMessage.classList.remove('message-reply-highlight');
  void quotedMessage.offsetWidth;
  quotedMessage.classList.add('message-reply-highlight');
  quotedMessage.addEventListener('animationend', (animationEvent) => {
    if (animationEvent.animationName === 'message-reply-flash') {
      quotedMessage.classList.remove('message-reply-highlight');
    }
  }, { once: true });
});

settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const saveButton = document.getElementById('settings-save');
  const color = colorHexInput.value.trim();
  setStatus(settingsStatus);
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    setStatus(settingsStatus, 'Invalid color format. Use #RRGGBB.');
    return;
  }

  saveButton.disabled = true;
  try {
    const result = await api.updateProfile({
      username: profileUsernameInput.value.trim(),
      displayName: displayNameInput.value.trim(),
      bio: profileBioInput.value.trim(),
      messageColor: color,
      timePrecision: timePrecisionInput.value,
      showLastSeen: showLastSeenInput.checked
    });
    appState.currentUser = result.user;
    const timePrecision = result.user.timePrecision === 'second' ? 'second' : 'minute';
    updateRenderedTimes(dialogList, timePrecision);
    updateRenderedTimes(messagesElement, timePrecision);
    populateSettings(result.user);
    setStatus(settingsStatus);
    showSaveToast();
    await loadConversations();
    if (appState.currentConversation) {
      const conversation = appState.conversations.find(
        (item) => item.id === appState.currentConversation.id
      );
      if (conversation) appState.currentConversation = conversation;
    }
  } catch (error) {
    setStatus(settingsStatus, error.message);
  } finally {
    saveButton.disabled = false;
  }
});

profileUsernameInput.addEventListener('input', () => {
  const start = profileUsernameInput.selectionStart;
  profileUsernameInput.value = profileUsernameInput.value.toLowerCase();
  profileUsernameInput.setSelectionRange(start, start);
});

colorHexInput.addEventListener('input', () => {
  if (/^#[0-9a-fA-F]{6}$/.test(colorHexInput.value)) setColor(colorHexInput.value);
});
customColorInput.addEventListener('input', () => setColor(customColorInput.value));

socket.on('connect_error', () => {
  setStatus(sidebarStatus, 'Live updates disconnected. Check your internet connection.');
});
socket.on('connect', () => {
  setStatus(sidebarStatus);
  socket.emit('presence:active', !document.hidden);
  if (appState.currentConversation) {
    openConversation(appState.currentConversation);
  } else {
    loadConversations();
    loadSearchResults();
  }
});
socket.on('presence:snapshot', (userIds) => {
  onlineUserIds = new Set(userIds.filter((userId) => userId !== appState.currentUser?.id));
  for (const conversation of appState.conversations) {
    conversation.otherUser.online = onlineUserIds.has(conversation.otherUser.id);
  }
  if (appState.currentConversation) {
    appState.currentConversation.otherUser.online = onlineUserIds.has(
      appState.currentConversation.otherUser.id
    );
  }
  renderConversationPresence();
});
socket.on('presence:update', updatePresence);
document.addEventListener('visibilitychange', () => {
  if (!appState.currentUser) return;
  if (socket.connected) socket.emit('presence:active', !document.hidden);
  if (document.hidden) return;
  if (!socket.connected) {
    socket.connect();
  } else if (appState.currentConversation) {
    openConversation(appState.currentConversation);
  } else {
    loadConversations();
    loadSearchResults();
  }
});
socket.on('conversation:message', ({ conversationId, message }) => {
  const isCurrentConversation = appState.currentConversation?.id === conversationId;
  if (isCurrentConversation) {
    appendMessage(message);
  }
  updateConversationFromMessage(conversationId, message);
  if (!appState.conversations.some((conversation) => conversation.id === conversationId)) {
    refreshConversation(conversationId);
  }

  if (
    isCurrentConversation &&
    !document.hidden &&
    message.senderId !== appState.currentUser.id
  ) {
    api.markConversationRead(conversationId).catch((error) => {
      setStatus(conversationStatus, error.message);
      refreshConversation(conversationId);
    });
  }
});
socket.on('message:hidden', ({ conversationId, messageId }) => {
  if (appState.currentConversation?.id === conversationId) {
    removeMessageFromCurrentView(messageId);
  } else {
    loadConversations();
  }
});
socket.on('message:deleted', ({ conversationId, messageId }) => {
  if (appState.currentConversation?.id === conversationId) {
    removeMessageFromCurrentView(messageId);
  } else {
    loadConversations();
  }
});
socket.on('conversation:deleted', ({ conversationId }) => {
  clearDeletedConversation(conversationId);
  loadConversations();
});
socket.on('conversation:hidden', ({ conversationId }) => {
  clearDeletedConversation(conversationId);
  loadConversations();
});
socket.on('conversation:restored', ({ conversationId }) => {
  refreshConversation(conversationId);
});

async function restoreSession() {
  try {
    const result = await api.session();
    showWorkspace(result.user);
  } catch (error) {
    showLogin(error.message === 'Please log in.' ? '' : error.message);
  }
}

restoreSession();
