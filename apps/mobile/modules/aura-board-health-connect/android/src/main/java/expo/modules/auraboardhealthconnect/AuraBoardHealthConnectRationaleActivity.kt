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
      text = "걸음 수 기록은 선택 사항이에요. 권한을 허용한 경우에만 작동합니다."
      textSize = 16f
      setTextColor(Color.rgb(82, 82, 82))
      setLineSpacing(0f, 1.35f)
      setPadding(0, dp(14), 0, 0)
    })

    val sections = listOf(
      "필요한 권한" to "걸음 수만 읽습니다.",
      "사용 목적" to "걷기 진행도, 걷기 보상과 학급 걷기 챌린지·순위를 제공하는 데만 사용합니다.",
      "저장·표시" to "날짜별 걸음 수 합계는 안전하게 저장되며 연결된 학부모와 학급 걷기 순위에 표시될 수 있습니다.",
      "실시간 표시" to "걷기 화면을 보는 동안 걸음 변화만 화면에 표시하며 센서 정보는 저장하지 않습니다.",
      "읽지 않는 정보" to "심박수, 수면, 체중, 위치 정보와 이동 경로는 읽거나 저장하지 않으며 다른 건강 기록을 추가하지도 않습니다.",
      "권한 관리" to "휴대폰의 건강 데이터 설정에서 언제든 권한을 바꿀 수 있습니다."
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
      text = "확인"
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
