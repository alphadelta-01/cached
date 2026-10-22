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
const conversationView = document.getElementById('conversation-view');
const welcomeView = document.getElementById('welcome-view');
const conversationName = document.getElementById('conversation-name');
const conversationUsername = document.getElementById('conversation-username');
const conversationStatus = document.getElementById('conversation-status');
const messagesElement = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const composer = document.getElementById('composer');
const settingsForm = document.getElementById('settings-form');
const settingsStatus = document.getElementById('settings-status');
const saveToast = document.getElementById('save-toast');
const saveToastClose = document.getElementById('save-toast-close');
let saveToastTimeout;
const logoutConfirmation = document.getElementById('logout-confirmation');
const logoutStatus = document.getElementById('logout-status');
const logoutCancel = document.getElementById('logout-cancel');
const logoutConfirm = document.getElementById('logout-confirm');
const deleteConfirmation = document.getElementById('delete-confirmation');
const deleteStatus = document.getElementById('delete-status');
const deleteConfirm = document.getElementById('delete-confirm');
const deleteCancel = document.getElementById('delete-cancel');
const deleteScopeOptions = document.querySelectorAll('input[name="delete-scope"]');
const deleteConversationButton = document.getElementById('conversation-delete');
const chatActionsMenu = document.getElementById('chat-actions-menu');
const openDeleteConfirmation = document.getElementById('open-delete-confirmation');
const displayNameInput = document.getElementById('display-name');
const profileUsernameInput = document.getElementById('profile-username');
const colorPalette = document.getElementById('color-palette');
const customColorInput = document.getElementById('custom-color');
const colorHexInput = document.getElementById('color-hex');
const messagePreview = document.getElementById('message-preview');
let authScreen = 'welcome';
let signupUsername = '';
let signupTicket = '';
let recoveryPhrase = '';
let recoveryChallengePositions = [];
let openedConversationRequest = 0;
let messages = [];

function setStatus(element, message = '', type = 'error') {
  element.textContent = message;
  element.classList.toggle('error', Boolean(message) && type === 'error');
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

saveToastClose.addEventListener('click', dismissSaveToast);

function showLogin(message = '') {
  appState.currentUser = null;
  appState.conversations = [];
  appState.currentConversation = null;
  socket.disconnect();
  settingsOverlay.hidden = true;
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
}

function setAuthScreen(screen) {
  authScreen = screen;
  const isWelcome = screen === 'welcome';
  authWelcome.hidden = !isWelcome;
  authPanel.hidden = isWelcome;
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

function renderCurrentMessages(scrollToBottom = true) {
  renderMessages(messagesElement, messages, appState.currentUser.id);
  if (scrollToBottom) messagesElement.scrollTop = messagesElement.scrollHeight;
}

function appendMessage(message) {
  if (messages.some((existing) => existing.id === message.id)) return;
  messages.push(message);
  messages.sort((left, right) => left.id - right.id);
  renderCurrentMessages();
}

async function openConversation(conversation) {
  const requestId = ++openedConversationRequest;
  if (appState.currentConversation) {
    socket.emit('conversation:leave', appState.currentConversation.id);
  }
  appState.currentConversation = conversation;
  messages = [];
  conversationName.textContent = conversation.otherUser.displayName;
  conversationUsername.textContent =
    `@${conversation.otherUser.username} · ID ${conversation.otherUser.id}`;
  conversationView.hidden = false;
  welcomeView.hidden = true;
  chatPanel.classList.add('conversation-open');
  setStatus(conversationStatus);
  renderCurrentMessages(false);
  renderConversations(dialogList, appState.conversations, appState.currentUser.id, openConversation);

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
    const conversation = appState.conversations.find(
      (item) => item.id === result.conversationId
    );
    if (!conversation) {
      throw new Error('Could not load the chat. Please try again.');
    }
    await openConversation(conversation);
    searchQuery.value = '';
    setActiveView('dialogs');
  } catch (error) {
    searchResults.replaceChildren();
    setStatus(sidebarStatus, error.message);
  }
}

function setActiveView(view) {
  const wasSettingsOpen = !settingsOverlay.hidden;
  appState.activeView = view;
  document.querySelectorAll('.sidebar-view').forEach((section) => {
    section.hidden = section.id !== `${view}-view`;
  });
  settingsOverlay.hidden = view !== 'settings';
  settingsToggle.classList.toggle('active', view === 'settings');
  settingsToggle.setAttribute('aria-pressed', String(view === 'settings'));
  setStatus(sidebarStatus);
  if (view === 'settings') {
    document.getElementById('settings-back').focus();
  } else if (wasSettingsOpen) {
    settingsToggle.focus();
  }
}

function setColor(value) {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return;
  const color = value.toUpperCase();
  colorHexInput.value = color;
  customColorInput.value = color;
  createColorPalette(colorPalette, color, setColor);
  updateMessagePreview(messagePreview, color);
}

function populateSettings(user) {
  displayNameInput.value = user.displayName;
  profileUsernameInput.value = user.username;
  setColor(user.messageColor);
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
  logoutConfirmation.hidden = true;
}

function closeDeleteConfirmation() {
  deleteConfirmation.hidden = true;
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
  messages = [];
  openedConversationRequest += 1;
  conversationView.hidden = true;
  welcomeView.hidden = false;
  chatPanel.classList.remove('conversation-open');
}

document.getElementById('logout').addEventListener('click', () => {
  setStatus(logoutStatus);
  logoutConfirmation.hidden = false;
  logoutCancel.focus();
});

logoutCancel.addEventListener('click', closeLogoutConfirmation);
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
  deleteConfirmation.hidden = false;
  deleteCancel.focus();
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.chat-actions')) setChatActionsMenuOpen(false);
});

deleteCancel.addEventListener('click', closeDeleteConfirmation);
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
  if (!logoutConfirmation.hidden) {
    closeLogoutConfirmation();
    return;
  }
  if (!deleteConfirmation.hidden) {
    closeDeleteConfirmation();
    return;
  }
  if (!settingsOverlay.hidden) setActiveView('dialogs');
});

deleteScopeOptions.forEach((option) => {
  option.addEventListener('change', () => setStatus(deleteStatus));
});

settingsToggle.addEventListener('click', () => setActiveView(
  appState.activeView === 'settings' ? 'dialogs' : 'settings'
));
document.getElementById('settings-back').addEventListener('click', () => {
  setActiveView('dialogs');
});
settingsOverlay.addEventListener('click', (event) => {
  if (event.target === settingsOverlay) setActiveView('dialogs');
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
  try {
    const result = await api.searchUsers(query);
    renderSearchResults(searchResults, result.users, openUser);
  } catch (error) {
    setStatus(sidebarStatus, error.message);
  } finally {
    searchQuery.disabled = false;
  }
});

searchQuery.addEventListener('input', () => {
  if (!searchQuery.value.trim() && appState.activeView === 'search') {
    searchResults.replaceChildren();
    setActiveView('dialogs');
  }
});

document.getElementById('back-button').addEventListener('click', () => {
  if (appState.currentConversation) {
    socket.emit('conversation:leave', appState.currentConversation.id);
  }
  appState.currentConversation = null;
  openedConversationRequest += 1;
  chatPanel.classList.remove('conversation-open');
  conversationView.hidden = true;
  welcomeView.hidden = false;
  renderConversations(dialogList, appState.conversations, appState.currentUser.id, openConversation);
  setActiveView('dialogs');
});

composer.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  const conversation = appState.currentConversation;
  if (!text || !conversation) return;
  sendButton.disabled = true;
  setStatus(conversationStatus);
  try {
    const result = await api.sendMessage(conversation.id, text);
    if (appState.currentConversation?.id === conversation.id) {
      appendMessage(result.message);
    }
    messageInput.value = '';
    await loadConversations();
  } catch (error) {
    setStatus(conversationStatus, error.message);
  } finally {
    sendButton.disabled = false;
    messageInput.focus();
  }
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
      messageColor: color
    });
    appState.currentUser = result.user;
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
socket.on('connect', () => setStatus(sidebarStatus));
socket.on('conversation:message', ({ conversationId, message }) => {
  if (appState.currentConversation?.id === conversationId) {
    appendMessage(message);
  }
  loadConversations();
});
socket.on('conversation:deleted', ({ conversationId }) => {
  clearDeletedConversation(conversationId);
  loadConversations();
});
socket.on('conversation:hidden', ({ conversationId }) => {
  clearDeletedConversation(conversationId);
  loadConversations();
});
socket.on('conversation:restored', () => loadConversations());

async function restoreSession() {
  try {
    const result = await api.session();
    showWorkspace(result.user);
  } catch (error) {
    showLogin(error.message === 'Please log in.' ? '' : error.message);
  }
}

restoreSession();
