import { supabase } from "../supabaseClient";

let tempoInativo = null;

export async function logoutCompleto() {

    try {

        await supabase.auth.signOut();

    } catch (e) {
        console.log("Erro logout:", e);
    }

    localStorage.clear();
    sessionStorage.clear();

    window.location.href = "/login";
}



export function iniciarControleSessao() {

    function resetarTempo() {

        if (tempoInativo) {
            clearTimeout(tempoInativo);
        }

        tempoInativo = setTimeout(() => {

            logoutCompleto();

        }, 20 * 60 * 1000); // 20 minutos
    }


    window.onload = resetarTempo;

    document.onmousemove = resetarTempo;
    document.onkeypress = resetarTempo;
    document.onclick = resetarTempo;
    document.ontouchstart = resetarTempo;

}



export async function verificarSessao() {

    const { data } = await supabase.auth.getSession();

    if (!data.session) {

        window.location.href = "/login";

        return false;
    }

    return true;
}
