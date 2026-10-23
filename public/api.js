async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...options.headers
      }
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Could not connect to the server. Check your internet connection.');
    }
    throw error;
  }

  let result = {};
  try {
    result = await response.json();
  } catch {
    if (response.ok) throw new Error('The server returned an invalid response.');
  }
  if (!response.ok) {
    throw new Error(result.error || `Server error (${response.status}).`);
  }
  return result;
}

const api = {
  session: () => apiRequest('/api/session'),
  prepareRegistration: (username, password, displayName) => apiRequest('/api/register/prepare', {
    method: 'POST',
    body: JSON.stringify({ username, password, displayName })
  }),
  completeRegistration: (ticket, answers) => apiRequest('/api/register/complete', {
    method: 'POST',
    body: JSON.stringify({ ticket, answers })
  }),
  recover: (username, phrase, password) => apiRequest('/api/recover', {
    method: 'POST',
    body: JSON.stringify({ username, phrase, password })
  }),
  login: (username, password) => apiRequest('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  }),
  logout: () => apiRequest('/api/logout', { method: 'POST' }),
  updateProfile: (profile) => apiRequest('/api/profile', {
    method: 'PUT',
    body: JSON.stringify(profile)
  }),
  getUserProfile: (userId) => apiRequest(`/api/users/${userId}/profile`),
  searchUsers: (query) => apiRequest(`/api/users/search?q=${encodeURIComponent(query)}`),
  getConversations: () => apiRequest('/api/conversations'),
  deleteConversation: (conversationId, scope) => apiRequest(
    `/api/conversations/${conversationId}`,
    { method: 'DELETE', body: JSON.stringify({ scope }) }
  ),
  openConversation: (userId) => apiRequest('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ userId })
  }),
  getMessages: (conversationId) => apiRequest(
    `/api/conversations/${conversationId}/messages`
  ),
  deleteMessage: (conversationId, messageId, scope) => apiRequest(
    `/api/conversations/${conversationId}/messages/${messageId}`,
    { method: 'DELETE', body: JSON.stringify({ scope }) }
  ),
  forwardMessage: (conversationId, messageId, destinationConversationId) => apiRequest(
    `/api/conversations/${conversationId}/messages/${messageId}/forward`,
    { method: 'POST', body: JSON.stringify({ destinationConversationId }) }
  ),
  markConversationRead: (conversationId) => apiRequest(
    `/api/conversations/${conversationId}/read`,
    { method: 'POST' }
  ),
  getPushConfig: () => apiRequest('/api/push/config'),
  searchTenorGifs: (query) => apiRequest(`/api/tenor/search?q=${encodeURIComponent(query)}`),
  uploadAttachment: (conversationId, file) => {
    const form = new FormData();
    form.append('file', file);
    return apiRequest(`/api/conversations/${conversationId}/attachments`, {
      method: 'POST',
      body: form
    });
  },
  deleteAttachment: (conversationId, attachmentId) => apiRequest(
    `/api/conversations/${conversationId}/attachments/${attachmentId}`,
    { method: 'DELETE' }
  ),
  savePushSubscription: (subscription) => apiRequest('/api/push/subscriptions', {
    method: 'PUT',
    body: JSON.stringify(subscription)
  }),
  deletePushSubscription: (endpoint) => apiRequest('/api/push/subscriptions', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint })
  }),
  sendMessage: (conversationId, text, replyToId = null, attachmentIds = [], tenorGifs = []) => apiRequest(
    `/api/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ text, replyToId, attachmentIds, tenorGifs })
    }
  )
};
