async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
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
  sendMessage: (conversationId, text) => apiRequest(
    `/api/conversations/${conversationId}/messages`,
    { method: 'POST', body: JSON.stringify({ text }) }
  )
};
