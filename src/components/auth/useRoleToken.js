import { useState } from 'react'

function useRoleToken(role) {
  const [token, setToken] = useState(() => sessionStorage.getItem(`evol_${role}_token`) || '')
  const logout = () => { sessionStorage.removeItem(`evol_${role}_token`); setToken('') }
  return [token, setToken, logout]
}

export default useRoleToken

