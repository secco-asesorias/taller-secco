import { supabase } from './supabase'

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function logout() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function cargarPerfil(userId) {
  const { data, error } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

export async function listarUsuarios() {
  const { data, error } = await supabase
    .from('perfiles')
    .select('*')
    .order('nombre')
  if (error) throw error
  return data || []
}

export async function actualizarRol(userId, rol) {
  const { error } = await supabase
    .from('perfiles')
    .update({ rol })
    .eq('id', userId)
  if (error) throw error
}
