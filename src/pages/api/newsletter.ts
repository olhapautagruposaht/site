import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ ok: false, message: 'Informe um e-mail válido.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!supabase) {
      return new Response(JSON.stringify({ ok: false, message: 'Supabase não configurado.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { error } = await supabase
      .from('newsletter_subscribers')
      .insert({ email, source: 'site_home' });

    if (error) {
      // Unique constraint violation (email already subscribed)
      if (error.code === '23505') {
        return new Response(
          JSON.stringify({ ok: true, message: 'Este e-mail já está inscrito.' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ ok: false, message: 'Não foi possível concluir a inscrição.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, message: 'Inscrito com sucesso.' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false, message: 'Erro inesperado ao inscrever.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
