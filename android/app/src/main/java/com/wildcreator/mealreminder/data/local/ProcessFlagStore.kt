package com.wildcreator.mealreminder.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.first

private val Context.flagDataStore: DataStore<Preferences> by preferencesDataStore(name = "app_flags")

/**
 * 「本次进程已提示」类标记的存储。
 *
 * 需求：未绑定手机号的弹窗每次冷启动弹一次，杀进程重启后再次弹。
 * 做法：进程启动时生成一个随机 processId，DataStore 里记录「上次提示时的 processId」；
 * 值等于当前 processId 说明本次进程已经提示过。杀进程后 processId 变化，弹窗自然重现。
 */
@Singleton
class ProcessFlagStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    private val processId: String = UUID.randomUUID().toString()

    /** 本次进程是否还没提示过绑定手机号。 */
    suspend fun shouldShowPhonePrompt(): Boolean {
        val stored = context.flagDataStore.data.first()[KEY_PHONE_PROMPT_PROCESS]
        return stored != processId
    }

    /** 标记本次进程已提示。 */
    suspend fun markPhonePromptShown() {
        context.flagDataStore.edit { prefs -> prefs[KEY_PHONE_PROMPT_PROCESS] = processId }
    }

    /** 登出时清掉，便于下次登录重新提示。 */
    suspend fun resetPhonePrompt() {
        context.flagDataStore.edit { prefs -> prefs.remove(KEY_PHONE_PROMPT_PROCESS) }
    }

    private companion object {
        val KEY_PHONE_PROMPT_PROCESS = stringPreferencesKey("phone_prompt_process_id")
    }
}
