package expo.modules.auraboardhealthconnect

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

class AuraBoardHealthConnectRationaleActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    window.statusBarColor = Color.WHITE
    window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR

    val content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(24), dp(28), dp(24), dp(28))
    }

    content.addView(TextView(this).apply {
      text = "Aura Board 걷기 데이터 이용 안내"
      textSize = 24f
      setTextColor(Color.rgb(10, 10, 10))
      setTypeface(typeface, android.graphics.Typeface.BOLD)
    })

    content.addView(TextView(this).apply {
      text = "Health Connect 연결은 선택 사항이며, 사용자가 권한을 허용한 경우에만 동작합니다."
      textSize = 16f
      setTextColor(Color.rgb(82, 82, 82))
      setLineSpacing(0f, 1.35f)
      setPadding(0, dp(14), 0, 0)
    })

    val sections = listOf(
      "읽는 정보" to "걸음 수와 이동 거리만 읽습니다.",
      "저장하는 정보" to "학생 계정에는 날짜별 걸음 수와 거리 합계만 저장합니다.",
      "수집하지 않는 정보" to "GPS 위치, 이동 경로, 원본 센서 샘플은 수집하거나 저장하지 않습니다.",
      "사용 목적" to "학생과 담당 교사가 걷기 현황을 확인하는 데만 사용합니다.",
      "광고 및 AI" to "Health Connect 데이터는 광고 개인화나 AI 학습에 사용하지 않습니다.",
      "권한 관리" to "Android의 Health Connect 설정에서 언제든 권한을 철회할 수 있습니다."
    )

    sections.forEach { (title, body) ->
      content.addView(TextView(this).apply {
        text = title
        textSize = 14f
        setTextColor(Color.rgb(10, 10, 10))
        setTypeface(typeface, android.graphics.Typeface.BOLD)
        setPadding(0, dp(22), 0, 0)
      })
      content.addView(TextView(this).apply {
        text = body
        textSize = 15f
        setTextColor(Color.rgb(82, 82, 82))
        setLineSpacing(0f, 1.35f)
        setPadding(0, dp(6), 0, 0)
      })
    }

    content.addView(Button(this).apply {
      text = "닫기"
      isAllCaps = false
      setOnClickListener { finish() }
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        dp(48)
      ).apply {
        topMargin = dp(28)
      }
    })

    setContentView(ScrollView(this).apply {
      isFillViewport = true
      addView(
        content,
        ViewGroup.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.WRAP_CONTENT
        )
      )
    })
  }

  private fun dp(value: Int): Int =
    (value * resources.displayMetrics.density).toInt()
}
